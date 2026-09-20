package com.ifsc.laucherbox.dados

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import com.ifsc.laucherbox.sistema.Root

/** Configuração do hotspot do box. */
data class ConfigHotspot(
    val ligado: Boolean,
    val ssid: String?,
    val senha: String?,
)

/**
 * Nome e senha do hotspot, lidos por root de `/data/misc/wifi/softap.conf`.
 *
 * O arquivo é binário e não é legível sem root (o dono é o usuário `wifi`).
 */
object Hotspot {
    private const val TAG = "Hotspot"
    private const val ARQUIVO = "/data/misc/wifi/softap.conf"

    // Constantes ocultas do WifiManager, as mesmas que o app da balança usa.
    private const val WIFI_AP_STATE_ENABLING = 12
    private const val WIFI_AP_STATE_ENABLED = 13

    fun ler(context: Context): ConfigHotspot {
        val (ssid, senha) = lerConfiguracao()
        return ConfigHotspot(ligado = estaLigado(context), ssid = ssid, senha = senha)
    }

    /** O AP está no ar (subindo ou ligado). Lido por reflexão, sem root. */
    fun estaLigado(context: Context): Boolean = try {
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val estado = wifi.javaClass.getMethod("getWifiApState").invoke(wifi) as Int
        estado == WIFI_AP_STATE_ENABLED || estado == WIFI_AP_STATE_ENABLING
    } catch (e: Throwable) {
        Log.w(TAG, "getWifiApState indisponível: ${e.message}")
        false
    }

    private fun lerConfiguracao(): Pair<String?, String?> {
        val dados = Root.executarBytes("cat $ARQUIVO") ?: return null to null
        return interpretar(dados)
    }

    /**
     * O `WifiApConfigStore` do framework grava, em big-endian:
     *
     *     int32   apBand
     *     UTF     SSID      (2 bytes de tamanho + os bytes)
     *     ...     miolo de tamanho variável
     *     UTF     senha
     *
     * O miolo entre o SSID e a senha **não tem tamanho garantido** — nestes
     * boxes são 12 bytes (três int32, o último o authType = 1 para WPA_PSK,
     * conferido byte a byte no MXQ), mas é detalhe do firmware. Pular um
     * offset fixo quebraria em outro.
     *
     * Por isso a senha é *achada*: procura-se o offset em que o tamanho
     * declarado consome exatamente o resto do arquivo. Só o último campo pode
     * satisfazer isso, então o casamento é inequívoco. Se ainda assim nada
     * casar (arquivo com lixo no fim, por exemplo), cai no layout conhecido.
     */
    private fun interpretar(dados: ByteArray): Pair<String?, String?> {
        if (dados.size < 6) return null to null

        // apBand (int32) — não interessa, só ocupa espaço
        var pos = 4
        val ssid = lerUtf(dados, pos) ?: return null to null
        pos += 2 + ssid.toByteArray(Charsets.UTF_8).size

        // varredura: o prefixo de tamanho que fecha exatamente no fim do arquivo
        var senha: String? = null
        for (o in pos until dados.size - 1) {
            val tam = tamanhoUtf(dados, o)
            if (tam > 0 && o + 2 + tam == dados.size) {
                senha = String(dados, o + 2, tam, Charsets.UTF_8)
            }
        }
        if (senha != null) return ssid to senha

        // reserva: o layout observado nos dois firmwares — 12 bytes de miolo
        val alternativa = lerUtf(dados, pos + 12)
        if (alternativa != null) Log.i(TAG, "senha lida pelo layout conhecido de 12 bytes")
        return ssid to alternativa
    }

    private fun tamanhoUtf(dados: ByteArray, o: Int): Int {
        if (o + 2 > dados.size) return -1
        return ((dados[o].toInt() and 0xFF) shl 8) or (dados[o + 1].toInt() and 0xFF)
    }

    /** Lê uma string no formato `readUTF` do DataInputStream a partir de [pos]. */
    private fun lerUtf(dados: ByteArray, pos: Int): String? {
        val tam = tamanhoUtf(dados, pos)
        if (tam <= 0 || pos + 2 + tam > dados.size) return null
        return String(dados, pos + 2, tam, Charsets.UTF_8)
    }
}
