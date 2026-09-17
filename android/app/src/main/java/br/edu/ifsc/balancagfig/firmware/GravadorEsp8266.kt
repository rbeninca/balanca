package br.edu.ifsc.balancagfig.firmware

import android.util.Base64
import android.util.Log
import br.edu.ifsc.balancagfig.serial.PortaSerialUsb.CanalBruto
import org.json.JSONObject
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

/**
 * Gravação de firmware no ESP8266 pela porta serial — o que `esptool.py
 * write_flash` (container atualizador) e o esptool-js (tela de firmware via
 * WebSerial) fazem, portado para rodar no box.
 *
 * Sequência, igual ao esptool: reset para o bootloader ROM via DTR/RTS →
 * SYNC a 115200 → upload do stub flasher para a RAM → CHANGE_BAUDRATE →
 * FLASH_BEGIN/FLASH_DATA (blocos de 16 KiB, sem compressão) → MD5 pelo stub →
 * reset para o firmware novo. Protocolo: pacotes SLIP com cabeçalho
 * [dir, op, tam(2), checksum/valor(4)] + dados, little-endian.
 *
 * O stub (assets/firmware/stub_esp8266.json) é o do esptool-js (Apache-2.0).
 */
class GravadorEsp8266(
    private val canal: CanalBruto,
    private val stubJson: String,
    private val log: (String) -> Unit,
) {
    class ErroGravacao(msg: String) : IOException(msg)

    private var stubAtivo = false

    /** Hexdump da troca de bytes no logcat até o stub subir; ligar só para depurar. */
    private var depurar = false

    /**
     * Grava [imagem] no endereço [endereco] (0x0 para o firmware da balança) e
     * reinicia o ESP. Lança [ErroGravacao] em qualquer falha; o ESP fica no
     * bootloader ou com o firmware anterior, nunca inacessível.
     */
    fun gravar(imagem: ByteArray, endereco: Int = 0, baudGravacao: Int = BAUD_GRAVACAO) {
        conectar()
        subirStub()
        mudarBaud(baudGravacao)

        val dados = preencherPara4(imagem)
        val blocos = (dados.size + TAM_BLOCO_FLASH - 1) / TAM_BLOCO_FLASH
        log("Gravando ${dados.size} bytes em 0x${endereco.toString(16)} ($blocos blocos)...")
        comando(FLASH_BEGIN, u32(dados.size) + u32(blocos) + u32(TAM_BLOCO_FLASH) + u32(endereco), timeoutMs = 10_000)

        val inicio = System.currentTimeMillis()
        for (seq in 0 until blocos) {
            val de = seq * TAM_BLOCO_FLASH
            val ate = minOf(de + TAM_BLOCO_FLASH, dados.size)
            val bloco = dados.copyOfRange(de, ate)
            comando(FLASH_DATA, u32(bloco.size) + u32(seq) + u32(0) + u32(0) + bloco, checksum = checksum(bloco), timeoutMs = 5_000)
            val pct = (100 * (seq + 1)) / blocos
            if (seq % 4 == 0 || seq == blocos - 1) log("Escrevendo em 0x${(endereco + de).toString(16)}... ($pct %)")
        }
        log("Escritos ${dados.size} bytes em ${(System.currentTimeMillis() - inicio) / 1000.0} s.")

        // Como o esptool: só deixa o modo flash depois de verificar
        val esperado = md5Hex(dados)
        val lido = md5Flash(endereco, dados.size)
        if (lido != esperado) throw ErroGravacao("MD5 divergente: esperado $esperado, lido $lido")
        log("MD5 verificado: $lido")

        // flash_begin(0,0) + flash_finish(reboot=false) com o stub, como o esptool.py
        comando(FLASH_BEGIN, u32(0) + u32(0) + u32(TAM_BLOCO_FLASH) + u32(0))
        comando(FLASH_END, u32(1))

        log("Reiniciando o ESP...")
        resetDuro()
    }

    // ─── Conexão e stub ─────────────────────────────────────────────────────

    private fun conectar() {
        canal.definirBaud(BAUD_ROM)
        var ultimoErro = "sem resposta"
        for (tentativa in 0 until MAX_TENTATIVAS_CONEXAO) {
            val atrasoMs = if (tentativa % 2 == 0) 50L else 550L
            log("Entrando em modo bootloader (tentativa ${tentativa + 1})...")
            resetParaBootloader(atrasoMs)
            Thread.sleep(50)
            limparEntrada()
            // O ROM download só responde a SYNC repetido em rajada; uma única
            // tentativa quase sempre falha (visto no TX9: resposta veio na 7ª).
            for (i in 0 until TENTATIVAS_SYNC) {
                try {
                    sincronizar()
                    log("Bootloader ROM sincronizado.")
                    return
                } catch (e: IOException) {
                    ultimoErro = e.message ?: "erro"
                }
            }
        }
        throw ErroGravacao("Não foi possível entrar em modo bootloader: $ultimoErro")
    }

    /** DTR/RTS no circuito de auto-reset do NodeMCU: RST em baixo, depois GPIO0 em baixo ao soltar RST. */
    private fun resetParaBootloader(atrasoMs: Long) {
        canal.definirDtr(false)
        canal.definirRts(true)
        Thread.sleep(100)
        canal.definirDtr(true)
        canal.definirRts(false)
        Thread.sleep(atrasoMs)
        canal.definirDtr(false)
    }

    private fun resetDuro() {
        canal.definirDtr(false)
        canal.definirRts(true)
        Thread.sleep(100)
        canal.definirRts(false)
    }

    private fun sincronizar() {
        val corpo = byteArrayOf(0x07, 0x07, 0x12, 0x20) + ByteArray(32) { 0x55 }
        // As réplicas do ROM ao SYNC não trazem status confiável; o esptool também não as valida
        comando(SYNC, corpo, timeoutMs = 100, validarStatus = false)
        // O ROM responde ao SYNC repetido com várias réplicas; drena o resto
        repeat(8) { lerPacote(null, 40) ?: return }
    }

    private fun subirStub() {
        val stub = JSONObject(stubJson)
        val texto = Base64.decode(stub.getString("text"), Base64.DEFAULT)
        val dados = Base64.decode(stub.getString("data"), Base64.DEFAULT)
        log("Enviando stub flasher (${texto.size + dados.size} bytes)...")
        for ((segmento, inicio) in listOf(texto to stub.getInt("text_start"), dados to stub.getInt("data_start"))) {
            if (segmento.isEmpty()) continue
            val blocos = (segmento.size + TAM_BLOCO_RAM - 1) / TAM_BLOCO_RAM
            comando(MEM_BEGIN, u32(segmento.size) + u32(blocos) + u32(TAM_BLOCO_RAM) + u32(inicio))
            for (seq in 0 until blocos) {
                val bloco = segmento.copyOfRange(seq * TAM_BLOCO_RAM, minOf((seq + 1) * TAM_BLOCO_RAM, segmento.size))
                comando(MEM_DATA, u32(bloco.size) + u32(seq) + u32(0) + u32(0) + bloco, checksum = checksum(bloco))
            }
        }
        comando(MEM_END, u32(0) + u32(stub.getInt("entry")), timeoutMs = 500)
        // O stub anuncia "OHAI" ao iniciar
        val saudacao = lerQuadroSlip(TIMEOUT_PADRAO_MS) ?: throw ErroGravacao("Stub não respondeu")
        if (String(saudacao, Charsets.US_ASCII) != "OHAI") {
            throw ErroGravacao("Resposta inesperada do stub: ${saudacao.hex()}")
        }
        stubAtivo = true
        depurar = false
        log("Stub em execução.")
    }

    private fun mudarBaud(novo: Int) {
        if (novo == BAUD_ROM) return
        log("Mudando baud para $novo...")
        comando(CHANGE_BAUDRATE, u32(novo) + u32(BAUD_ROM))
        canal.definirBaud(novo)
        Thread.sleep(50)
        limparEntrada()
    }

    private fun md5Flash(endereco: Int, tamanho: Int): String {
        val resp = comando(SPI_FLASH_MD5, u32(endereco) + u32(tamanho) + u32(0) + u32(0), timeoutMs = 8_000)
        // Stub devolve 16 bytes binários; ROM devolveria 32 caracteres hex
        return if (resp.dados.size >= 16 && stubAtivo) resp.dados.copyOfRange(0, 16).hex()
        else String(resp.dados, Charsets.US_ASCII).take(32).lowercase()
    }

    // ─── Protocolo ──────────────────────────────────────────────────────────

    private class Resposta(val valor: Int, val dados: ByteArray)

    /** Envia um comando e espera a resposta correspondente, validando os bytes de status. */
    private fun comando(
        op: Int, corpo: ByteArray, checksum: Int = 0, timeoutMs: Long = TIMEOUT_PADRAO_MS, validarStatus: Boolean = true,
    ): Resposta {
        val pacote = ByteBuffer.allocate(8 + corpo.size).order(ByteOrder.LITTLE_ENDIAN)
            .put(0).put(op.toByte()).putShort(corpo.size.toShort()).putInt(checksum).put(corpo).array()
        val quadro = slipCodificar(pacote)
        if (depurar) Log.d(TAG, "tx(${quadro.size}): ${quadro.copyOf(minOf(quadro.size, 64)).hex()}")
        canal.escrever(quadro)
        val resp = lerPacote(op, timeoutMs) ?: throw ErroGravacao("Sem resposta ao comando 0x${op.toString(16)}")
        // ESP8266: os 2 últimos bytes dos dados são [status, erro]
        if (validarStatus && resp.dados.size >= 2) {
            val status = resp.dados[resp.dados.size - 2].toInt() and 0xff
            val erro = resp.dados[resp.dados.size - 1].toInt() and 0xff
            if (status != 0) throw ErroGravacao("Comando 0x${op.toString(16)} falhou (erro 0x${erro.toString(16)})")
        }
        return resp
    }

    /** Lê quadros até achar uma resposta (dir=1) ao [op] (ou qualquer, se null). */
    private fun lerPacote(op: Int?, timeoutMs: Long): Resposta? {
        val limite = System.currentTimeMillis() + timeoutMs
        while (true) {
            val restante = limite - System.currentTimeMillis()
            if (restante <= 0) return null
            val quadro = lerQuadroSlip(restante) ?: return null
            if (quadro.size < 8 || quadro[0].toInt() != 1) continue
            val bb = ByteBuffer.wrap(quadro).order(ByteOrder.LITTLE_ENDIAN)
            val opResp = bb.get(1).toInt() and 0xff
            val valor = bb.getInt(4)
            if (op == null || opResp == op) return Resposta(valor, quadro.copyOfRange(8, quadro.size))
        }
    }

    // ─── SLIP ───────────────────────────────────────────────────────────────

    private var pendentes = ByteArray(0)

    private fun limparEntrada() {
        canal.descartarEntrada()
        pendentes = ByteArray(0)
    }

    /** Próximo quadro SLIP completo (sem os delimitadores), ou null no timeout. */
    private fun lerQuadroSlip(timeoutMs: Long): ByteArray? {
        val limite = System.currentTimeMillis() + timeoutMs
        val quadro = java.io.ByteArrayOutputStream()
        var dentro = false
        var escape = false
        while (true) {
            if (pendentes.isEmpty()) {
                val restante = limite - System.currentTimeMillis()
                if (restante <= 0) return null
                pendentes = canal.ler(restante) ?: return null
                if (depurar) Log.d(TAG, "rx(${pendentes.size}): ${pendentes.copyOf(minOf(pendentes.size, 96)).hex()}")
            }
            var i = 0
            while (i < pendentes.size) {
                val b = pendentes[i].toInt() and 0xff
                i++
                if (!dentro) {
                    if (b == 0xc0) dentro = true
                    continue
                }
                when {
                    escape -> {
                        quadro.write(if (b == 0xdc) 0xc0 else if (b == 0xdd) 0xdb else b)
                        escape = false
                    }
                    b == 0xdb -> escape = true
                    b == 0xc0 -> {
                        pendentes = pendentes.copyOfRange(i, pendentes.size)
                        if (quadro.size() == 0) { dentro = true; continue } // C0 C0 consecutivos
                        return quadro.toByteArray()
                    }
                    else -> quadro.write(b)
                }
            }
            pendentes = ByteArray(0)
        }
    }

    private fun slipCodificar(dados: ByteArray): ByteArray {
        val saida = java.io.ByteArrayOutputStream(dados.size + 8)
        saida.write(0xc0)
        for (b in dados) {
            when (b.toInt() and 0xff) {
                0xdb -> { saida.write(0xdb); saida.write(0xdd) }
                0xc0 -> { saida.write(0xdb); saida.write(0xdc) }
                else -> saida.write(b.toInt())
            }
        }
        saida.write(0xc0)
        return saida.toByteArray()
    }

    // ─── Utilitários ────────────────────────────────────────────────────────

    private fun u32(v: Int): ByteArray = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(v).array()

    /** XOR de todos os bytes a partir de 0xEF. */
    private fun checksum(dados: ByteArray): Int {
        var c = 0xef
        for (b in dados) c = c xor (b.toInt() and 0xff)
        return c
    }

    private fun preencherPara4(dados: ByteArray): ByteArray {
        val resto = dados.size % 4
        return if (resto == 0) dados else dados + ByteArray(4 - resto) { 0xff.toByte() }
    }

    private fun md5Hex(dados: ByteArray): String = MessageDigest.getInstance("MD5").digest(dados).hex()

    private fun ByteArray.hex() = joinToString("") { "%02x".format(it) }

    companion object {
        private const val TAG = "GravadorEsp8266"
        const val BAUD_ROM = 115200
        const val BAUD_GRAVACAO = 921600

        private const val TIMEOUT_PADRAO_MS = 3_000L
        private const val MAX_TENTATIVAS_CONEXAO = 6
        private const val TENTATIVAS_SYNC = 20
        private const val TAM_BLOCO_RAM = 0x1800
        private const val TAM_BLOCO_FLASH = 0x4000   // FLASH_WRITE_SIZE do stub ESP8266

        private const val FLASH_BEGIN = 0x02
        private const val FLASH_DATA = 0x03
        private const val FLASH_END = 0x04
        private const val MEM_BEGIN = 0x05
        private const val MEM_END = 0x06
        private const val MEM_DATA = 0x07
        private const val SYNC = 0x08
        private const val CHANGE_BAUDRATE = 0x0f
        private const val SPI_FLASH_MD5 = 0x13
    }
}
