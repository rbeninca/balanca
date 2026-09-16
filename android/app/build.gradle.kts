import javax.inject.Inject
import org.gradle.process.ExecOperations

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "br.edu.ifsc.balancagfig"
    compileSdk = 36

    defaultConfig {
        applicationId = "br.edu.ifsc.balancagfig"
        // TX9 anuncia Android 10 mas roda API 25 (7.1.2)
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
    }
    lintOptions {
        disable(
            "MutableCollectionMutableState",
            "AutoboxingStateCreation"
        )
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.usb.serial)
    implementation(libs.nanohttpd)
    implementation(libs.nanohttpd.websocket)
    testImplementation(libs.junit)
    testImplementation(libs.json)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}

// ---------------------------------------------------------------------------
// Frontend: copia pacotes/aplicacao/dist-web para os assets do APK, para que
// o servidor HTTP embutido sirva a mesma revisão do frontend do monorepo.
// Compile antes com `npm run compilar -w pacotes/aplicacao` na raiz do repo.
// ---------------------------------------------------------------------------

val distWeb = rootProject.layout.projectDirectory.dir("../pacotes/aplicacao/dist-web")

val copiarFrontend = tasks.register<Sync>("copiarFrontend") {
    group = "balanca"
    description = "Copia pacotes/aplicacao/dist-web para app/src/main/assets/web."
    from(distWeb)
    into(layout.projectDirectory.dir("src/main/assets/web"))
    onlyIf {
        val existe = distWeb.asFile.exists()
        if (!existe) logger.warn("dist-web ausente em ${distWeb.asFile}; APK sem frontend embutido.")
        existe
    }
}

// Esquema do banco: mesmo arquivo do pacote api, para não divergir.
val copiarEsquema = tasks.register<Copy>("copiarEsquema") {
    group = "balanca"
    description = "Copia pacotes/api/src/bancoDados/esquema.sql para os assets."
    from(rootProject.layout.projectDirectory.file("../pacotes/api/src/bancoDados/esquema.sql"))
    into(layout.projectDirectory.dir("src/main/assets"))
}

tasks.named("preBuild") { dependsOn(copiarFrontend, copiarEsquema) }

// ---------------------------------------------------------------------------
// Tarefas de implantação no TX9 (grupo "tx9" no painel Gradle). O endereço
// pode ser trocado com -Ptx9.device=IP:PORTA.
// ---------------------------------------------------------------------------

/** Roda um script de scripts/ passando o dispositivo alvo como argumento. */
abstract class ExecutarScriptTx9 : DefaultTask() {

    @get:Inject
    abstract val operacoesExec: ExecOperations

    @get:InputFile
    abstract val script: RegularFileProperty

    @get:Input
    abstract val dispositivo: Property<String>

    /** Raiz do projeto: os scripts chamam ./gradlew e caminhos relativos. */
    @get:Internal
    abstract val diretorioRaiz: DirectoryProperty

    @TaskAction
    fun executar() {
        operacoesExec.exec {
            workingDir(diretorioRaiz.get().asFile)
            commandLine("bash", script.get().asFile.absolutePath, dispositivo.get())
        }
    }
}

val dispositivoTx9 = providers.gradleProperty("tx9.device").orElse("192.168.1.111:5555")

tasks.register<ExecutarScriptTx9>("instalarNoTx9") {
    group = "tx9"
    description = "Instala o APK no TX9 e libera o app-op WRITE_SETTINGS exigido pelo hotspot."
    dependsOn("assembleDebug")
    script.set(rootProject.layout.projectDirectory.file("scripts/preparar-tx9.sh"))
    diretorioRaiz.set(rootProject.layout.projectDirectory)
    dispositivo.set(dispositivoTx9)
}
