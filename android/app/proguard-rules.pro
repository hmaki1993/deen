# Keep Capacitor plugin classes and annotated methods
-keep class com.deen.app.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.PluginMethod <methods>;
}
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
