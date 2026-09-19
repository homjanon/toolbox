package com.homjanon.toolbox;

import android.graphics.Color;
import android.view.View;
import android.view.Window;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 供前端调用：
 *   ① open()          在原生模块容器中打开模块页（并透传当前主题，模块页据此设置系统栏配色）
 *   ② setSystemBars() 设置状态栏 + 底部导航条颜色与图标明暗
 *      —— CSS 主题管不到系统组件，App 内切深色时必须由原生来设，否则底部会留一条浅色带。
 */
@CapacitorPlugin(name = "ModuleLauncher")
public class ModulePlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String name = call.getString("name", "");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        String theme = call.getString("theme", "light");
        ModuleActivity.start(getActivity(), url, name, theme);
        call.resolve();
    }

    @PluginMethod
    public void setSystemBars(PluginCall call) {
        String status = call.getString("status");
        String nav = call.getString("nav");
        Boolean lightIcon = call.getBoolean("lightIcon", true);   // true=浅色背景→用深色图标
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                if (status != null) w.setStatusBarColor(Color.parseColor(status));
                if (nav != null) w.setNavigationBarColor(Color.parseColor(nav));
                View dv = w.getDecorView();
                int flags = dv.getSystemUiVisibility();
                if (Boolean.TRUE.equals(lightIcon)) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                } else {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                }
                dv.setSystemUiVisibility(flags);
                call.resolve();
            } catch (Exception e) {
                call.reject("setSystemBars failed: " + e.getMessage());
            }
        });
    }
}
