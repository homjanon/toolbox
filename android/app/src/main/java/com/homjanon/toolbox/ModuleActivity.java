package com.homjanon.toolbox;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/**
 * 模块容器：极简顶栏（左「‹返回」、右「⌂首页」）+ WebView。
 *
 * 2026-09-13 变更（按用户反馈）：
 *   ① 去掉顶栏中间的模块名 —— 页面自身已有标题，顶栏再显示一遍会出现"上下两个标题"；
 *   ② 删掉 setFitsSystemWindows(true)：它与下面的 insets 监听器冲突（fitsSystemWindows 自行消费 insets，
 *      监听器形同虚设），导致整页从屏幕最顶端渲染、被状态栏压住、inv 头部按钮被切；
 *   ③ 接管返回：先页内后退，退到底才关闭本页回宫格（贴合微信那种"左滑=返回上一页"的手感）。
 *      走 onBackPressed 而非 OnBackInvokedCallback —— manifest 里显式
 *      android:enableOnBackInvokedCallback="false" 锁死旧分发路径，各版本行为一致可预期。
 */
public class ModuleActivity extends AppCompatActivity {

    /** 白名单：命中则在 WebView 内继续打开，否则交给系统浏览器（如新闻原文外链） */
    private static final String[] ALLOWED_HOST_SUFFIXES = {
            ".hellohopo.dpdns.org", "hellohopo.dpdns.org",
            ".github.io", "github.io",
            "news.google.com"
    };

    private WebView webView;

    public static void start(Context ctx, String url, String name, String theme) {
        Intent it = new Intent(ctx, ModuleActivity.class);
        it.putExtra("url", url);
        it.putExtra("name", name);
        it.putExtra("theme", theme);
        ctx.startActivity(it);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String url = getIntent().getStringExtra("url");
        /* 主题由主页透传（模块页自己读不到 App 内设置）→ 用于设置系统栏与留白色，
           避免深色网页下顶部/底部露出浅色带 */
        boolean dark = "dark".equals(getIntent().getStringExtra("theme"));
        int barColor = dark ? 0xFF171B22 : 0xFFFFFFFF;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(barColor);
        // 注意：这里不能 setFitsSystemWindows(true)，否则下方 insets 监听器失效

        /* ── WebView ── */
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (isAllowed(u.getHost())) return false;   // 白名单内：App 内继续
                try {                                        // 外链：系统浏览器
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);

        /* 系统栏配色：CSS 管不到状态栏/导航条，必须由原生设置 */
        try {
            Window w = getWindow();
            w.setStatusBarColor(barColor);
            w.setNavigationBarColor(barColor);
            View dv = w.getDecorView();
            int flags = dv.getSystemUiVisibility();
            if (dark) {
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            } else {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            }
            dv.setSystemUiVisibility(flags);
        } catch (Exception ignored) {
        }

        /* 状态栏 / 手势条 insets：顶栏避让状态栏，底部避让手势条（各 Android 版本一致生效） */
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets s = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, s.top, 0, s.bottom);
            return insets;
        });

        if (url != null) webView.loadUrl(url);
    }

    /** 返回：先页内后退，退到底再关闭本页（回到宫格） */
    @Override
    public void onBackPressed() {
        onBack();
    }

    private void onBack() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else finish();
    }

    
    private boolean isAllowed(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        for (String suffix : ALLOWED_HOST_SUFFIXES) {
            if (h.equals(suffix) || h.endsWith(suffix)) return true;
        }
        return false;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
