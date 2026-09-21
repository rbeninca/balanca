import java.util.Properties
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
        versionCode = 16
        versionName = "2.7.8"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // GeckoView é grande; o TX9 é armeabi-v7a, então só empacotamos essa ABI
        ndk { abiFilters += "armeabi-v7a" }
    }

    // ------------------------------------------------------------------
    // Assinatura única para debug e release: o atualizador automático faz
    // `pm install -r` por cima do app instalado, e o Android exige a mesma
    // assinatura. Local: android/chaves/chaves.properties (fora do git; ver
    // chaves/LEIA-ME.md). CI: variáveis BALANCA_KEYSTORE / BALANCA_KEYSTORE_SENHA /
    // BALANCA_CHAVE_ALIAS / BALANCA_CHAVE_SENHA. Sem nenhum dos dois, cai na
    // chave de debug do Android Studio (APK NÃO atualizável pelos boxes).
    // ------------------------------------------------------------------
    val chaves = Properties().apply {
        rootProject.file("chaves/chaves.properties").takeIf { it.isFile }?.inputStream()?.use { load(it) }
    }
    val keystore = System.getenv("BALANCA_KEYSTORE")?.let { file(it) }
        ?: chaves.getProperty("storeFile")?.let { rootProject.file(it) }
    val assinaturaBalanca = if (keystore?.isFile == true) signingConfigs.create("balanca") {
        storeFile = keystore
        storePassword = System.getenv("BALANCA_KEYSTORE_SENHA") ?: chaves.getProperty("storePassword")
        keyAlias = System.getenv("BALANCA_CHAVE_ALIAS") ?: chaves.getProperty("keyAlias")
        keyPassword = System.getenv("BALANCA_CHAVE_SENHA") ?: chaves.getProperty("keyPassword")
    } else {
        logger.warn("Keystore da BalançaGFIG ausente — APK assinado com a chave de debug (não atualizável nos boxes).")
        null
    }

    buildTypes {
        debug {
            assinaturaBalanca?.let { signingConfig = it }
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            assinaturaBalanca?.let { signingConfig = it }
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
        // BuildConfig.VERSION_NAME é publicado no /saude, para o inventário
        // saber a versão de cada box sem precisar de ADB.
        buildConfig = true
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
    // Motor Firefox embutido (a WebView do box é Chromium 52, não roda o frontend)
    implementation("org.mozilla.geckoview:geckoview:115.0.20230726201356")
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

val firmware = rootProject.layout.projectDirectory.dir("../firmware")

val copiarFrontend = tasks.register<Sync>("copiarFrontend") {
    group = "balanca"
    description = "Copia pacotes/aplicacao/dist-web (+ firmware.bin, como o Dockerfile.webapp) para app/src/main/assets/web."
    from(distWeb)
    // Mesmos nomes que Dockerfile.webapp publica: a tela de firmware do frontend
    // baixa BASE_URL/firmware.bin e BASE_URL/firmware-versao.json.
    from(firmware.file("firmware.bin"))
    from(firmware.file("versao.json")) { rename { "firmware-versao.json" } }
    into(layout.projectDirectory.dir("src/main/assets/web"))
    // O firmware.bin chega por dois caminhos: o workflow de deploy copia ele
    // para pacotes/aplicacao/public/ antes de buildar o frontend, e daí ele
    // entra no dist-web; aqui ele é copiado de novo, do firmware/. É o mesmo
    // arquivo. Sem uma estratégia explícita o Gradle 8 aborta com
    // "Entry firmware.bin is a duplicate" — que é como o release quebrava.
    duplicatesStrategy = DuplicatesStrategy.INCLUDE
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

    /** Tarefa repassada ao scripts/box.sh: instalar | desfazer | estado | ciclo. */
    @get:Input
    abstract val tarefa: Property<String>

    /** Raiz do projeto: os scripts chamam ./gradlew e caminhos relativos. */
    @get:Internal
    abstract val diretorioRaiz: DirectoryProperty

    @TaskAction
    fun executar() {
        operacoesExec.exec {
            workingDir(diretorioRaiz.get().asFile)
            commandLine("bash", script.get().asFile.absolutePath, tarefa.get(), dispositivo.get())
        }
    }
}

val dispositivoTx9 = providers.gradleProperty("tx9.device").orElse("192.168.1.111:5555")

tasks.register<ExecutarScriptTx9>("instalarNoTx9") {
    group = "box"
    description = "Instala o APK num box (TX9 ou MXQ), pré-aprova root/USB, libera WRITE_SETTINGS, reinicia e verifica."
    dependsOn("assembleDebug")
    script.set(rootProject.layout.projectDirectory.file("scripts/box.sh"))
    diretorioRaiz.set(rootProject.layout.projectDirectory)
    dispositivo.set(dispositivoTx9)
    tarefa.set("instalar")
}

tasks.register<ExecutarScriptTx9>("desfazerNoTx9") {
    group = "box"
    description = "Desfaz a instalação num box: remove o app, a política de root, WRITE_SETTINGS, a permissão USB e as regras de rede."
    script.set(rootProject.layout.projectDirectory.file("scripts/box.sh"))
    diretorioRaiz.set(rootProject.layout.projectDirectory)
    dispositivo.set(dispositivoTx9)
    tarefa.set("desfazer")
}

tasks.register<ExecutarScriptTx9>("estadoNoBox") {
    group = "box"
    description = "Confere o estado de um box sem mexer em nada (app, API, frontend, serial, hotspot)."
    script.set(rootProject.layout.projectDirectory.file("scripts/box.sh"))
    diretorioRaiz.set(rootProject.layout.projectDirectory)
    dispositivo.set(dispositivoTx9)
    tarefa.set("estado")
}
