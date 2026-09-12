package com.homjanon.toolbox;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 供前端调用：在原生模块容器（带返回/首页顶栏）中打开一个模块页。 */
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
        ModuleActivity.start(getActivity(), url, name);
        call.resolve();
    }
}
