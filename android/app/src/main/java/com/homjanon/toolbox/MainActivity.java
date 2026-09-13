package com.homjanon.toolbox;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * 宫格首页（根页面）。
 *
 * 2026-09-13 演进记录：
 *   ① insets 避让 —— 此前完全没处理，Android 15 强制全屏延伸下内容顶到状态栏底下；
 *   ② 返回手势「连滑两次退出」（manifest 已设 enableOnBackInvokedCallback=false 锁定旧分发路径）；
 *   ③ 【v0.5】加原生 JS 接口 AndroidToolbox —— 因为实测注入 WebView 的 native-bridge.js 里
 *      **没有 registerPlugin**（core 的构建产物才有），前端无打包器时只能走 cap.nativePromise
 *      这条底层通道；为了不再赌单一路径，这里再铺一条完全独立的原生通道做兜底：
 *      JS 依次尝试 cap.nativePromise → window.AndroidToolbox → location.href。
 */
public class MainActivity extends BridgeActivity {

    private static final long EXIT_WINDOW_MS = 2000;
    private long lastBackAt = 0;

    /** 暴露给网页的原生接口（仅带 @JavascriptInterface 注解的方法可被调用） */
    private class NativeBridge {
        @JavascriptInterface
        public void openModule(final String url, final String name) {
            if (url == null || url.isEmpty()) return;
            runOnUiThread(() -> ModuleActivity.start(MainActivity.this, url, name));
        }
    }

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(ModulePlugin.class);

        /* 状态栏 / 手势条避让：让 WebView 整体待在系统栏之内 */
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets s = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, s.top, 0, s.bottom);
            return insets;
        });

        /* 原生兜底通道：给首页注入 window.AndroidToolbox.openModule(url, name) */
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) {
            wv.addJavascriptInterface(new NativeBridge(), "AndroidToolbox");
        }
    }

    @Override
    public void onBackPressed() {
        // ① WebView 还有历史：先页内后退
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null && wv.canGoBack()) {
            wv.goBack();
            return;
        }
        // ② 宫格是根页面：连滑两次才退出，防误触
        long now = System.currentTimeMillis();
        if (now - lastBackAt < EXIT_WINDOW_MS) {
            super.onBackPressed();
            return;
        }
        lastBackAt = now;
        Toast.makeText(this, "再滑一次退出", Toast.LENGTH_SHORT).show();
    }
}
