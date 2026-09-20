package br.edu.ifsc.balancagfig.sistema

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Controle do hotspot (SoftAP) do TX9.
 *
 * O TX9 anuncia `ro.build.version.release = 10.0`, mas roda de fato API 25
 * (Android 7.1.2). Nessa API o caminho válido é a API oculta
 * `WifiManager.setWifiApEnabled`, que exige:
 *  - permissão CHANGE_WIFI_STATE (concedida na instalação);
 *  - o app-op WRITE_SETTINGS liberado para o pacote.
 *
 * Como este firmware traz `net.tethering.noprovisioning = true`, o framework
 * NÃO exige app de sistema/priv-app para ligar o AP: o `enforceTetherChange`
 * cai no teste de WRITE_SETTINGS. Por isso instalar em /system/priv-app é
 * desnecessário — o que faltava era o app-op.
 */
object HotspotManager {
    private const val TAG = "HotspotManager"

    /** Constantes ocultas de WifiManager para o estado do AP. */
    private const val WIFI_AP_STATE_ENABLING = 12
    private const val WIFI_AP_STATE_ENABLED = 13

    /** Nome base da rede. O sufixo com o MAC é acrescentado por [ssidDoBox]. */
    const val SSID_BASE = "balancaGFIG"

    /** Senha usada enquanto o box não tiver nenhuma gravada. */
    const val SENHA_PADRAO = "12345678"

    /** Endereçamento da rede do hotspot (mesmo padrão do tethering do Android). */
    const val IP_HOTSPOT = "192.168.43.1"
    private const val DHCP_INICIO = "192.168.43.2"
    private const val DHCP_FIM = "192.168.43.254"
    private const val PREFIXO_REDE = "24"
    private const val REDE_HOTSPOT = "192.168.43.0/$PREFIXO_REDE"

    /** Espera a tela do Settings desenhar antes de pedir o dump do uiautomator. */
    private const val ATRASO_TELA_MS = 4000L

    /** Entre tentativas de dump: a UI precisa ficar ociosa para o uiautomator responder. */
    private const val ATRASO_DUMP_MS = 2500L
    private const val TENTATIVAS_DUMP = 4

    /** Resultado de uma operação, já com mensagem pronta para a UI. */
    data class Resultado(
        val sucesso: Boolean,
        val mensagem: String,
        /** true quando falta o app-op WRITE_SETTINGS e a UI deve abrir a tela de permissão. */
        val precisaPermissaoEscrita: Boolean = false
    )

    /**
     * Liga o hotspot.
     *
     * @param ssid nome da rede; por padrão [ssidDoBox] — `balancaGFIG-<4 últimos
     *   do MAC do eth0>`, para distinguir os boxes no ar sem precisar consultar
     *   a lista de clientes.
     * @param senha 8 a 63 caracteres para WPA2; string vazia cria rede aberta.
     *   **null preserva** a senha que já estiver gravada no box — é o padrão,
     *   para a troca feita na tela não ser desfeita quando o app religa o AP.
     */
    suspend fun ligarHotspot(
        context: Context,
        ssid: String = ssidDoBox(),
        senha: String? = null,
    ): Resultado = withContext(Dispatchers.IO) {
        val app = context.applicationContext
        val wifiManager = app.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val senhaEfetiva = senha ?: senhaDoHotspot(wifiManager) ?: SENHA_PADRAO

        if (senhaEfetiva.isNotEmpty() && senhaEfetiva.length !in 8..63) {
            return@withContext Resultado(false, "Senha do hotspot deve ter entre 8 e 63 caracteres.")
        }

        if (!garantirPermissaoEscrita(app)) {
            return@withContext Resultado(
                sucesso = false,
                mensagem = "Falta a permissão \"modificar configurações do sistema\" para ligar o hotspot.",
                precisaPermissaoEscrita = true
            )
        }
        garantirWriteSecureSettings(app)

        // Android 8+ removeu setWifiApEnabled; o caminho passa a ser o tethering do ConnectivityManager.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return@withContext ligarViaTethering(app)
        }

        // O chip do TX9 (Amlogic gxl) não faz STA + AP ao mesmo tempo: desliga o Wi-Fi cliente antes.
        if (wifiManager.isWifiEnabled) {
            wifiManager.isWifiEnabled = false
        }

        // O AP sobe com o que estiver gravado na configuração do framework —
        // setWifiApEnabled não aceita config por chamada. Sem isto o rk322x
        // usaria o "AndroidAP" padrão em vez do SSID da balança.
        definirConfiguracaoAp(wifiManager, ssid, senhaEfetiva)

        try {
            val metodo = wifiManager.javaClass.getMethod(
                "setWifiApEnabled",
                WifiConfiguration::class.java,
                Boolean::class.javaPrimitiveType
            )
            metodo.invoke(wifiManager, montarConfiguracaoAp(ssid, senhaEfetiva), true)
        } catch (e: Throwable) {
            val causa = e.cause ?: e
            Log.w(TAG, "setWifiApEnabled falhou; tentando pela tela do Settings", causa)
            val pelaTela = acionarPelaTelaDoSettings(app, wifiManager, ligar = true)
            if (pelaTela.sucesso) return@withContext pelaTela
            return@withContext Resultado(
                false,
                "Falha ao ligar o hotspot: ${causa.message ?: causa.javaClass.simpleName}"
            )
        }

        if (!aguardarApLigado(wifiManager)) {
            return@withContext Resultado(false, "O rádio do hotspot não subiu a tempo.")
        }

        // setWifiApEnabled sobe apenas o rádio: sem esta etapa a rede aparece,
        // mas o cliente não recebe IP (o Tethering do Android 7 só entra pelo
        // startTethering, que exige permissão de sistema). Como o TX9 é root,
        // fazemos a mesma sequência que o framework faria, via netd.
        return@withContext if (ativarTethering()) {
            Resultado(true, "Hotspot \"$ssid\" ligado em $IP_HOTSPOT (DHCP ativo).")
        } else {
            Resultado(false, "Rede \"$ssid\" no ar, mas sem DHCP/NAT: root indisponível.")
        }
    }

    /** Desliga o hotspot e desfaz o NAT/DHCP montado em [ativarTethering]. */
    suspend fun desligarHotspot(context: Context): Resultado = withContext(Dispatchers.IO) {
        val app = context.applicationContext

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return@withContext desligarViaTethering(app)
        }

        desativarTethering()

        val wifiManager = app.getSystemService(Context.WIFI_SERVICE) as WifiManager
        try {
            val metodo = wifiManager.javaClass.getMethod(
                "setWifiApEnabled",
                WifiConfiguration::class.java,
                Boolean::class.javaPrimitiveType
            )
            metodo.invoke(wifiManager, null, false)
            Resultado(true, "Hotspot desligado.")
        } catch (e: Throwable) {
            // Mesmo bug de firmware que impede ligar: sem este desvio, desligar
            // falhava em silêncio no MXQ e o AP seguia no ar com a senha velha
            // — a senha nova só valeria no próximo boot.
            val causa = e.cause ?: e
            Log.w(TAG, "setWifiApEnabled(false) falhou; tentando pela tela do Settings", causa)
            val pelaTela = acionarPelaTelaDoSettings(app, wifiManager, ligar = false)
            if (pelaTela.sucesso) return@withContext pelaTela
            Resultado(false, "Falha ao desligar o hotspot: ${causa.message ?: causa.javaClass.simpleName}")
        }
    }

    /** Espera o rádio do AP cair — usado ao desligar pela tela do sistema. */
    private suspend fun aguardarApDesligado(wifiManager: WifiManager): Boolean {
        repeat(20) {
            val estado = try {
                wifiManager.javaClass.getMethod("getWifiApState").invoke(wifiManager) as Int
            } catch (_: Throwable) {
                return true
            }
            // 11 = WIFI_AP_STATE_DISABLED, 14 = FAILED
            if (estado != WIFI_AP_STATE_ENABLED && estado != WIFI_AP_STATE_ENABLING) return true
            delay(500)
        }
        return false
    }

    /** Espera o rádio do AP ficar pronto antes de configurar endereço e DHCP. */
    private suspend fun aguardarApLigado(wifiManager: WifiManager): Boolean {
        repeat(20) {
            val estado = try {
                wifiManager.javaClass.getMethod("getWifiApState").invoke(wifiManager) as Int
            } catch (_: Throwable) {
                return true // Sem leitura de estado, segue em frente e deixa o netd reclamar.
            }
            if (estado == WIFI_AP_STATE_ENABLED) return true
            delay(500)
        }
        return false
    }

    /**
     * Grava SSID/senha na configuração do AP (API oculta
     * `setWifiApConfiguration`). Best-effort: no TX9 o `setWifiApEnabled` aceita
     * a config por chamada e isto é redundante; no rk322x é o único jeito de o
     * AP não subir com o "AndroidAP" padrão do framework.
     */
    /**
     * Nome da rede deste box: `balancaGFIG-<4 últimos do MAC do eth0>`.
     *
     * Com mais de um box no mesmo ambiente, o sufixo diz qual é qual sem
     * precisar abrir a lista de clientes do roteador. Sem MAC legível devolve o
     * nome base — melhor um nome genérico do que nome nenhum.
     */
    fun ssidDoBox(): String {
        val sufixo = macEthernet()
            ?.filter { it.isLetterOrDigit() }
            ?.takeLast(4)
            ?.uppercase()
        return if (sufixo.isNullOrBlank()) SSID_BASE else "$SSID_BASE-$sufixo"
    }

    /**
     * MAC da interface ethernet. Tenta o sysfs direto e só recorre ao root se o
     * SELinux barrar — o arquivo é legível, mas nem todo contexto de app pode.
     */
    private fun macEthernet(): String? {
        val caminho = "/sys/class/net/eth0/address"
        val direto = runCatching { File(caminho).readText().trim() }.getOrNull()
        if (!direto.isNullOrBlank()) return direto
        return Root.executarLendo("cat $caminho")?.trim()?.takeIf { it.isNotBlank() }
    }

    /**
     * Senha gravada na configuração do AP, ou null se o box não tem nenhuma.
     * A API é oculta e devolve o `preSharedKey` entre aspas.
     */
    /** Atalho para a tela, que não precisa conhecer o WifiManager. */
    fun senhaDoHotspot(context: Context): String? =
        senhaDoHotspot(context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)

    fun senhaDoHotspot(wifiManager: WifiManager): String? = try {
        val config = wifiManager.javaClass.getMethod("getWifiApConfiguration")
            .invoke(wifiManager) as? WifiConfiguration
        config?.preSharedKey?.trim('"')?.takeIf { it.isNotBlank() }
    } catch (e: Throwable) {
        Log.w(TAG, "getWifiApConfiguration indisponível: ${e.message}")
        null
    }

    /**
     * Troca a senha da rede mantendo o nome.
     *
     * Só grava a configuração: o AP precisa ser religado para a senha nova
     * valer, e quem chamou decide quando fazê-lo.
     */
    suspend fun trocarSenha(context: Context, novaSenha: String): Resultado =
        withContext(Dispatchers.IO) {
            val app = context.applicationContext
            if (novaSenha.length !in 8..63) {
                return@withContext Resultado(false, "A senha precisa ter entre 8 e 63 caracteres.")
            }
            if (!garantirPermissaoEscrita(app)) {
                return@withContext Resultado(
                    sucesso = false,
                    mensagem = "Falta a permissão \"modificar configurações do sistema\" para trocar a senha.",
                    precisaPermissaoEscrita = true
                )
            }
            garantirWriteSecureSettings(app)

            val wifiManager = app.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val ssid = ssidDoBox()
            if (!definirConfiguracaoAp(wifiManager, ssid, novaSenha)) {
                return@withContext Resultado(false, "O sistema não aceitou gravar a nova senha.")
            }
            Resultado(true, "Senha da rede \"$ssid\" alterada. Religue o hotspot para valer.")
        }

    private fun definirConfiguracaoAp(wifiManager: WifiManager, ssid: String, senha: String): Boolean = try {
        wifiManager.javaClass
            .getMethod("setWifiApConfiguration", WifiConfiguration::class.java)
            .invoke(wifiManager, montarConfiguracaoAp(ssid, senha))
        true
    } catch (e: Throwable) {
        Log.w(TAG, "setWifiApConfiguration indisponível: ${e.message}")
        false
    }

    /**
     * Liga o AP pela tela do Settings — caminho para o rk322x/MXQ.
     *
     * Neste firmware o `setWifiApEnabled` é recusado a qualquer app de
     * terceiros: o `WifiServiceImpl` grava `Settings.Global.WIFI_AP_ENABLED`
     * com o contexto do system_server (pacote "android", uid 1000) enquanto o
     * uid da chamada ainda é o do app, e o AppOps derruba com "Package android
     * does not belong to <uid>". É checagem de identidade, não de permissão:
     * nenhuma concessão feita ao app contorna. O Settings passa porque roda
     * como uid 1000 (sharedUserId android.uid.system).
     *
     * Então abrimos a tela de tethering e acionamos o switch. A posição vem do
     * `uiautomator dump` — bounds reais e o atributo `checked` —, nunca de
     * coordenada fixa: a linha é achada pelo título e o switch pela
     * sobreposição vertical com ele.
     *
     * Aqui NÃO chamamos [ativarTethering]: o Tethering do framework já sobe o
     * dnsmasq e o NAT junto com o rádio (ao contrário do TX9, onde o
     * setWifiApEnabled levanta só o rádio), e configurar por cima duplicaria
     * as regras.
     */
    private suspend fun acionarPelaTelaDoSettings(
        context: Context,
        wifiManager: WifiManager,
        ligar: Boolean,
    ): Resultado {
        val arquivo = "/data/local/tmp/balanca_ui.xml"
        val tela = "com.android.settings/.Settings${'$'}TetherSettingsActivity"

        Root.executar("am start -n '$tela'")
        delay(ATRASO_TELA_MS)

        // O dump exige a UI ociosa: se a tela ainda está assentando ele só
        // responde "could not get idle state" e não escreve o arquivo. Vale
        // insistir em vez de confiar num atraso fixo.
        var xml: String? = null
        for (tentativa in 1..TENTATIVAS_DUMP) {
            Root.executar("rm -f $arquivo")
            Root.executar("uiautomator dump $arquivo")
            xml = Root.executarLendo("cat $arquivo")?.takeIf { it.contains("<hierarchy") }
            if (xml != null) break
            Log.i(TAG, "dump da tela ainda não saiu (tentativa $tentativa)")
            delay(ATRASO_DUMP_MS)
        }
        Root.executar("rm -f $arquivo")
        val dump = xml

        if (dump == null) {
            voltarParaOApp(context)
            return Resultado(false, "não consegui ler a tela de tethering do sistema.")
        }

        // O toque tem que acontecer com a tela do Settings ainda na frente: as
        // coordenadas vêm do dump dela. Só depois de acionar é que devolvemos
        // o app ao primeiro plano.
        val botao = localizarBotaoDoHotspot(dump)
        if (botao == null) {
            voltarParaOApp(context)
            return Resultado(false, "não achei o botão do hotspot na tela do sistema.")
        }

        // já está no estado pedido?
        if (botao.ligado == ligar) {
            voltarParaOApp(context)
            return Resultado(
                true,
                if (ligar) "Hotspot já estava ligado." else "Hotspot já estava desligado.",
            )
        }

        Root.executar("input tap ${botao.x} ${botao.y}")
        val mudou = if (ligar) aguardarApLigado(wifiManager) else aguardarApDesligado(wifiManager)
        voltarParaOApp(context)
        if (!mudou) {
            return Resultado(
                false,
                if (ligar) "toquei no botão do hotspot, mas o rádio não subiu."
                else "toquei no botão do hotspot, mas o rádio não desligou.",
            )
        }
        return Resultado(
            true,
            if (ligar) "Hotspot ligado pela tela do sistema (DHCP do framework)."
            else "Hotspot desligado pela tela do sistema.",
        )
    }

    /** Traz o app de volta à frente — a tela do Settings ficou sobre o quiosque. */
    private fun voltarParaOApp(context: Context) {
        Root.executar("am start -n '${context.packageName}/.MainActivity'")
    }

    /** Botão do hotspot no dump do uiautomator: centro e estado atual. */
    private data class BotaoHotspot(val x: Int, val y: Int, val ligado: Boolean)

    private data class Retangulo(val x1: Int, val y1: Int, val x2: Int, val y2: Int)

    private fun localizarBotaoDoHotspot(xml: String): BotaoHotspot? {
        val nos = nosDoDump(xml)
        val titulo = nos.firstOrNull {
            it["resource-id"] == "android:id/title" && it["text"]?.startsWith("Portable Wi") == true
        } ?: return null
        val linha = retangulo(titulo["bounds"]) ?: return null
        val switch = nos.firstOrNull {
            it["resource-id"] == "android:id/switch_widget" &&
                retangulo(it["bounds"])?.let { r -> r.y1 <= linha.y2 && r.y2 >= linha.y1 } == true
        } ?: return null
        val r = retangulo(switch["bounds"]) ?: return null
        return BotaoHotspot((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2, switch["checked"] == "true")
    }

    private fun retangulo(valor: String?): Retangulo? {
        val m = RE_BOUNDS.find(valor ?: "") ?: return null
        return Retangulo(
            m.groupValues[1].toInt(), m.groupValues[2].toInt(),
            m.groupValues[3].toInt(), m.groupValues[4].toInt()
        )
    }

    /** Atributos de cada `<node>` do dump do uiautomator. */
    private fun nosDoDump(xml: String): List<Map<String, String>> =
        RE_NO.findAll(xml).map { no ->
            RE_ATRIBUTO.findAll(no.groupValues[1]).associate { it.groupValues[1] to it.groupValues[2] }
        }.toList()

    private val RE_NO = Regex("""<node\s([^>]*?)/?>""")
    private val RE_ATRIBUTO = Regex("""([A-Za-z0-9_:-]+)="([^"]*)"""")
    private val RE_BOUNDS = Regex("""\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]""")

    /**
     * Reproduz, via netd (`ndc`), o que o Tethering do framework faria:
     * endereço na interface do AP, servidor DHCP, encaminhamento e NAT para a
     * interface que hoje leva à internet (eth0 no TX9).
     *
     * O Android roteia por políticas (`ip rule`): pacotes encaminhados não
     * consultam a tabela `main`, só as tabelas do netd. Por isso a sub-rede do
     * AP precisa entrar na rede `local` e o `ipfwd add` cria a regra
     * `iif wlan0 lookup eth0`; sem isso a resposta da internet ao cliente
     * volta pela eth0 em vez da wlan0 e o hotspot "não navega".
     */
    private fun ativarTethering(): Boolean = executarComoRoot(
        """
        IFACE=${'$'}(getprop wifi.interface); [ -z "${'$'}IFACE" ] && IFACE=wlan0
        UPSTREAM=${'$'}(ip route get 8.8.8.8 2>/dev/null | sed -n 's/.* dev \([^ ]*\).*/\1/p' | head -1)
        ndc interface setcfg ${'$'}IFACE $IP_HOTSPOT $PREFIXO_REDE up
        ndc network interface add local ${'$'}IFACE
        ndc network route add local ${'$'}IFACE $REDE_HOTSPOT
        ndc tether interface add ${'$'}IFACE
        ndc tether start $DHCP_INICIO $DHCP_FIM
        ndc tether dns set 0 8.8.8.8 8.8.4.4
        ndc ipfwd enable
        echo 1 > /proc/sys/net/ipv4/ip_forward
        if [ -n "${'$'}UPSTREAM" ]; then
            ndc ipfwd add ${'$'}IFACE ${'$'}UPSTREAM
            ndc nat enable ${'$'}IFACE ${'$'}UPSTREAM 0
        fi
        exit 0
        """.trimIndent()
    )

    /** Desfaz o NAT, o DHCP e o endereço configurados em [ativarTethering]. */
    private fun desativarTethering(): Boolean = executarComoRoot(
        """
        IFACE=${'$'}(getprop wifi.interface); [ -z "${'$'}IFACE" ] && IFACE=wlan0
        UPSTREAM=${'$'}(ip route get 8.8.8.8 2>/dev/null | sed -n 's/.* dev \([^ ]*\).*/\1/p' | head -1)
        if [ -n "${'$'}UPSTREAM" ]; then
            ndc nat disable ${'$'}IFACE ${'$'}UPSTREAM 0
            ndc ipfwd remove ${'$'}IFACE ${'$'}UPSTREAM
        fi
        ndc ipfwd disable
        ndc tether stop
        ndc tether interface remove ${'$'}IFACE
        ndc network route remove local ${'$'}IFACE $REDE_HOTSPOT
        ndc network interface remove local ${'$'}IFACE
        ndc interface clearaddrs ${'$'}IFACE
        exit 0
        """.trimIndent()
    )

    /** Indica se o AP está ligado (ou subindo), lendo o estado oculto do WifiManager. */
    fun hotspotAtivo(context: Context): Boolean {
        val wifiManager = context.applicationContext
            .getSystemService(Context.WIFI_SERVICE) as WifiManager
        return try {
            val estado = wifiManager.javaClass.getMethod("getWifiApState").invoke(wifiManager) as Int
            estado == WIFI_AP_STATE_ENABLED || estado == WIFI_AP_STATE_ENABLING
        } catch (e: Throwable) {
            Log.w(TAG, "getWifiApState indisponível: ${e.message}")
            false
        }
    }

    /**
     * Intent da tela de "modificar configurações do sistema" para este pacote.
     * Devolve null quando a firmware de TV não traz essa tela — nesse caso só
     * resta liberar o app-op por `su`/adb.
     */
    fun intentPermissaoEscrita(context: Context): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null
        val intent = Intent(
            Settings.ACTION_MANAGE_WRITE_SETTINGS,
            Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return intent.takeIf { it.resolveActivity(context.packageManager) != null }
    }

    /**
     * Garante o app-op WRITE_SETTINGS. Se a tela de permissão não estiver
     * disponível (comum em firmware de TV box), tenta liberar via root, que o
     * TX9 possui em /system/xbin/su.
     */
    /**
     * Auto-concede WRITE_SECURE_SETTINGS via `pm grant` (root) a cada início.
     * Em alguns firmwares (ex.: Rockchip rk322x/MXQ) `setWifiApEnabled` via
     * reflexão exige essa permissão além do app-op WRITE_SETTINGS que basta no
     * TX9 (Amlogic) — e, por ser uma permissão "signature", uma concessão
     * feita uma vez pelo instalador não sobrevive ao reboot (some da lista de
     * "install permissions"). Pedir de novo a cada boot resolve nos dois
     * firmwares: no TX9, ou já está concedida (no-op) ou nunca é checada.
     */
    private fun garantirWriteSecureSettings(context: Context) {
        val permissao = "android.permission.WRITE_SECURE_SETTINGS"
        if (context.checkSelfPermission(permissao) == android.content.pm.PackageManager.PERMISSION_GRANTED) return
        Root.executar("pm grant ${context.packageName} $permissao")
    }

    private fun garantirPermissaoEscrita(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        if (Settings.System.canWrite(context)) return true

        val liberou = executarComoRoot(
            "appops set ${context.packageName} WRITE_SETTINGS allow"
        )
        return liberou && Settings.System.canWrite(context)
    }

    /** Monta a WifiConfiguration do AP (WPA2-PSK quando há senha, aberta quando não há). */
    private fun montarConfiguracaoAp(ssid: String, senha: String): WifiConfiguration {
        return WifiConfiguration().apply {
            // Para AP o SSID vai sem aspas, ao contrário de uma rede cliente.
            SSID = ssid
            hiddenSSID = false
            status = WifiConfiguration.Status.ENABLED
            allowedAuthAlgorithms.set(WifiConfiguration.AuthAlgorithm.OPEN)

            if (senha.isEmpty()) {
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
            } else {
                preSharedKey = senha
                // Sem WPA_PSK aqui o framework trata a rede como aberta e descarta a senha.
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
                allowedProtocols.set(WifiConfiguration.Protocol.RSN)
                allowedProtocols.set(WifiConfiguration.Protocol.WPA)
                allowedPairwiseCiphers.set(WifiConfiguration.PairwiseCipher.CCMP)
                allowedPairwiseCiphers.set(WifiConfiguration.PairwiseCipher.TKIP)
                allowedGroupCiphers.set(WifiConfiguration.GroupCipher.CCMP)
                allowedGroupCiphers.set(WifiConfiguration.GroupCipher.TKIP)
            }
        }
    }

    /**
     * Caminho para Android 8+: ConnectivityManager.startTethering (oculto).
     * Usa o SSID/senha já gravados em WifiApConfiguration, pois essa API não
     * aceita configuração por chamada.
     */
    private fun ligarViaTethering(context: Context): Resultado = chamarTethering(context, ligar = true)

    private fun desligarViaTethering(context: Context): Resultado = chamarTethering(context, ligar = false)

    private fun chamarTethering(context: Context, ligar: Boolean): Resultado {
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) ?: return Resultado(
            false, "ConnectivityManager indisponível."
        )
        return try {
            if (ligar) {
                val callbackClass = Class.forName("android.net.ConnectivityManager\$OnStartTetheringCallback")
                val metodo = connectivity.javaClass.getMethod(
                    "startTethering",
                    Int::class.javaPrimitiveType,
                    Boolean::class.javaPrimitiveType,
                    callbackClass
                )
                metodo.invoke(connectivity, 0 /* TETHERING_WIFI */, false, null)
                Resultado(true, "Hotspot ligado via tethering do sistema.")
            } else {
                val metodo = connectivity.javaClass.getMethod("stopTethering", Int::class.javaPrimitiveType)
                metodo.invoke(connectivity, 0 /* TETHERING_WIFI */)
                Resultado(true, "Hotspot desligado.")
            }
        } catch (e: Throwable) {
            val causa = e.cause ?: e
            Log.e(TAG, "startTethering/stopTethering falhou", causa)
            Resultado(false, "Falha no tethering: ${causa.message ?: causa.javaClass.simpleName}")
        }
    }

    private fun executarComoRoot(comando: String): Boolean = Root.executar(comando)
}
