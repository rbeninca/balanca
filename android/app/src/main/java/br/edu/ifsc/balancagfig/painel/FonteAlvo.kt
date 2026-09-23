package br.edu.ifsc.balancagfig.painel

import br.edu.ifsc.balancagfig.atualizacao.FonteAlvo
import br.edu.ifsc.balancagfig.atualizacao.Rede
import br.edu.ifsc.balancagfig.atualizacao.Versao
import org.json.JSONObject

/**
 * A versão-teto lida do painel (`GET /alvo`).
 *
 * Resposta esperada: `{"alvo":"2.8.501"}`; `{"alvo":null}` (ou chave ausente) é
 * "sem teto". Tudo o mais — painel fora do ar, JSON estranho, texto que não é
 * versão — devolve `null`, que é o mesmo que "sem teto": o atualizador volta ao
 * comportamento de sempre, sem estado de erro novo para o usuário resolver.
 */
class FonteAlvoHttp(
    private val rede: Rede,
    private val urlAlvo: String,
) : FonteAlvo {

    override fun alvo(): Versao? = try {
        val o = JSONObject(rede.obterTexto(urlAlvo))
        // `optString` de um JSONObject.NULL devolve o texto "null" — por isso o
        // `isNull` vem antes, e não a leitura direta.
        if (o.isNull("alvo")) null else Versao.analisar(o.optString("alvo"))
    } catch (e: Exception) {
        null
    }
}
