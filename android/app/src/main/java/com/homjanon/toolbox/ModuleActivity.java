package com.homjanon.toolbox;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
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
 * 模块容器：顶栏（‹返回 | 标题 | 首页⌂）+ WebView。
 * 解决三件事：
 *   ① 显式返回按钮；系统左滑手势 = 关闭本页回宫格（页内历史用左上角‹返回）
 *   ② 标题与状态栏保持距离（insets 顶垫，全部 Android 版本生效）
 *   ③ 模块页与宫格视觉一致
 */
public class ModuleActivity extends AppCompatActivity {

    /** 白名单：命中则在 WebView 内继续打开，否则交给系统浏览器（如新闻原文外链） */
    private static final String[] ALLOWED_HOST_SUFFIXES = {
            ".hellohopo.dpdns.org", "hellohopo.dpdns.org",
            ".github.io", "github.io",
            "news.google.com"
    };

    private WebView webView;

    public static void start(Context c, String url, String name) {
        Intent i = new Intent(c, ModuleActivity.class);
        i.putExtra("url", url);
        i.putExtra("name", name == null ? "" : name);
        c.startActivity(i);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String url = getIntent().getStringExtra("url");
        String name = getIntent().getStringExtra("name");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFFF6F7F9);
        root.setFitsSystemWindows(true);

        /* ── 顶栏：‹返回 | 标题 | ⌂首页 ── */
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(8), dp(10), dp(8), dp(10));
        bar.setBackgroundColor(0xFFFFFFFF);

        TextView back = navText("‹ 返回");
        back.setOnClickListener(v -> onBack());
        bar.addView(back);

        TextView title = new TextView(this);
        title.setText(name);
        title.setTextSize(16.5f);
        title.setTextColor(0xFF1F2430);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        tp.setMargins(dp(10), 0, dp(10), 0);
        bar.addView(title, tp);

        TextView home = navText("⌂ 首页");
        home.setOnClickListener(v -> finish());
        bar.addView(home);

        root.addView(bar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

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

        /* 状态栏/手势条 insets：顶栏避让，所有 Android 版本生效 */
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets s = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, s.top, 0, s.bottom);
            return insets;
        });

        if (url != null) webView.loadUrl(url);
    }

    private void onBack() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else finish();
    }

    private TextView navText(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(14.5f);
        t.setTextColor(0xFF2563EB);
        t.setPadding(dp(6), dp(4), dp(6), dp(4));
        t.setClickable(true);
        return t;
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
