package com.homjanon.toolbox;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * 宫格首页（根页面）。
 * 2026-09-13：
 *   ① 加 insets 避让 —— 此前完全没处理，Android 15 强制全屏延伸下内容顶到状态栏底下；
 *   ② 返回手势改为「连滑两次退出」：根页面按一下返回就直接退到桌面太容易误触。
 *      manifest 里已设 android:enableOnBackInvokedCallback="false"，确保各版本都走 onBackPressed。
 */
public class MainActivity extends BridgeActivity {

    private static final long EXIT_WINDOW_MS = 2000;
    private long lastBackAt = 0;

    @Override
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
