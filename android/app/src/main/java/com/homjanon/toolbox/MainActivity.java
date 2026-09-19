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
 * ⚠️ v0.6 关键修复（2026-09-13，源码级定位）：
 *   `registerPlugin()` **必须在 `super.onCreate()` 之前调用**。
 *   看 Capacitor 的 BridgeActivity 源码：super.onCreate() 内部会执行 load()，
 *   而 load() 里 `bridge = bridgeBuilder.addPlugins(...).create()` —— bridge 一旦 create 就定型，
 *   之后再 registerPlugin() 只是往 builder 里加，永远不会被采纳。
 *   症状：原生插件没注册 → JS 的 nativePromise 调用被拒绝 → 前端若"调用即当作成功"，
 *   表现就是"点了卡片没反应"。本项目 v0.4/v0.5 两个板块打不开正是这个原因。
 */
public class MainActivity extends BridgeActivity {

    /* 连按两次返回的间隔上限。取 3500ms 是为了盖住 Toast 的显示时长
       （默认约 2 秒）——用户读完提示再按，仍在窗口内，不会又落回"再按一次"分支。 */
    private static final long EXIT_WINDOW_MS = 3500;
    private long lastBackAt = 0;

    /** 暴露给网页的原生兜底接口（与 Capacitor 插件系统完全独立，Capacitor 内部怎么变都不影响） */
    private class NativeBridge {
        @JavascriptInterface
        public void openModule(final String url, final String name, final String theme) {
            if (url == null || url.isEmpty()) return;
            runOnUiThread(() -> ModuleActivity.start(MainActivity.this, url, name, theme));
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        /* ★ 必须在 super.onCreate() 之前：此时 bridge 还没 create，插件才会被采纳 */
        registerPlugin(ModulePlugin.class);

        super.onCreate(savedInstanceState);

        /* 状态栏 / 手势条避让：让 WebView 整体待在系统栏之内 */
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets s = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, s.top, 0, s.bottom);
            return insets;
        });

        addJsInterface();
    }

    @Override
    public void onResume() {   // 必须 public：父类 BridgeActivity.onResume() 是 public，不可缩小访问级别
        super.onResume();
        addJsInterface();      // 兜底：某些时序下 bridge 尚未就绪，这里再补一次
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void addJsInterface() {
        try {
            WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv == null) return;
            wv.addJavascriptInterface(new NativeBridge(), "AndroidToolbox");
        } catch (Exception ignored) {
            // 静默：上层还有 Capacitor 插件通道可用
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
        // ② 宫格是根页面：连按两次才退出，防误触
        long now = System.currentTimeMillis();
        if (now - lastBackAt < EXIT_WINDOW_MS) {
            /* ⚠️ 这里【不能】用 super.onBackPressed()：
               本项目 targetSdkVersion=35，该方法自 Android 13(API 33) 起已废弃，
               要经 OnBackPressedDispatcher 转发，一旦有组件注册并启用了返回回调，
               退出会被吞掉 —— 表现为"提示了但按了不退出"（v0.8 即此症）。
               同项目的 ModuleActivity 用 finish() 一直正常，故这里同样直接收尾。 */
            finishAndRemoveTask();
            return;
        }
        lastBackAt = now;
        Toast.makeText(this, "再返回一次退出", Toast.LENGTH_SHORT).show();
    }
}
