package br.edu.ifsc.balancagfig.sistema

import android.content.Context
import android.os.Build
import android.util.Log

/**
 * Identificador do box, para inventário e — mais adiante — acesso remoto.
 *
 * Formato `GFIG-<MODELO>-<MAC>`, por exemplo `GFIG-TX9-58EB81E3618C`.
 *
 * O MAC do ethernet é o único identificador estável que estes boxes oferecem:
 * não gravam `ro.serialno` (vem vazio, conferido nos dois) e o `android_id` é
 * derivado da assinatura do app, então muda em reset de fábrica. O sufixo do
 * MAC é o mesmo que aparece no nome da rede (`balancaGFIG-618C`), o que faz a
 * etiqueta casar com o que se vê no celular sem consultar nada.
 *
 * **O modelo vem do que o aparelho diz de si.** O MXQ, por exemplo, se
 * identifica como `TV BOX` — não como "MXQ" — e vira `TVBOX` depois da
 * normalização. Quando o nome do firmware não servir, fixe um à mão.
 */
object SerialDoBox {
    private const val TAG = "SerialDoBox"
    private const val PREFIXO = "GFIG"

    /**
     * Onde um serial fixado à mão é lido. Fica em `/data/misc`, e não nas
     * preferências do app, de propósito: inventário não pode se perder quando
     * alguém desinstala e reinstala o app. Exige root para escrever.
     */
    private const val ARQUIVO_FIXADO = "/data/misc/gfig/serial"

    /** Serial deste box. Nunca vazio. */
    fun ler(context: Context): String {
        // 1) Fixado à mão — cobre MAC duplicado em loteada, ou nome que o
        //    firmware não informa. Tem precedência sobre tudo.
        val fixado = Root.executarLendo("cat $ARQUIVO_FIXADO 2>/dev/null")
            ?.trim()
            ?.takeIf { it.isNotBlank() }
        if (fixado != null) return fixado

        // 2) Derivado: modelo + MAC do ethernet
        val modelo = modeloNormalizado()
        val mac = EnderecosRedesSeguro.mac()
        if (mac == null) {
            Log.w(TAG, "sem MAC do ethernet; serial fica só com o modelo")
            return "$PREFIXO-$modelo"
        }
        return "$PREFIXO-$modelo-${mac.filter { it.isLetterOrDigit() }.uppercase()}"
    }

    /** `Build.MODEL` sem espaços nem símbolos: "TV BOX" vira "TVBOX". */
    fun modeloNormalizado(): String =
        Build.MODEL.orEmpty()
            .filter { it.isLetterOrDigit() }
            .uppercase()
            .ifBlank { "BOX" }
}

/** Só para não espalhar try/catch: o MAC nunca pode derrubar quem chama. */
private object EnderecosRedesSeguro {
    fun mac(): String? = runCatching { EnderecosRede.macEthernet() }.getOrNull()
}
