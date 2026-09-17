pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // usb-serial-for-android (mik3y) é publicado apenas no JitPack
        maven("https://jitpack.io")
        // GeckoView (motor Firefox embutido para a aba WebView na TV do box)
        maven("https://maven.mozilla.org/maven2")
    }
}

rootProject.name = "BalancaGFIG"
include(":app")
