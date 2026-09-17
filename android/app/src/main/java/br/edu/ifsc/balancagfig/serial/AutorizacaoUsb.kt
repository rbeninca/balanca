package br.edu.ifsc.balancagfig.serial

import android.hardware.usb.UsbDevice
import android.util.Log
import br.edu.ifsc.balancagfig.sistema.Root

/**
 * Concede a permissão USB da balança sem diálogo, nos TX9 com root.
 *
 * O Android libera um dispositivo USB para um app de duas formas: pelo
 * diálogo de permissão ou pelo evento USB_DEVICE_ATTACHED resolvido para o
 * filtro do app (res/xml/filtro_usb.xml). No quiosque não há quem clique no
 * diálogo, então forçamos o evento: desautorizar e reautorizar o dispositivo
 * no sysfs faz o kernel reenumerá-lo, o UsbService dispara ATTACHED e, como só
 * este app casa com o filtro, ele recebe o intent já com a permissão.
 */
object AutorizacaoUsb {
    private const val TAG = "AutorizacaoUsb"

    /**
     * Reenumera [dispositivo] via sysfs. Devolve true se o comando rodou; a
     * permissão em si chega depois, pelo broadcast ATTACHED.
     */
    fun reenumerar(dispositivo: UsbDevice): Boolean {
        val vid = "%04x".format(dispositivo.vendorId)
        val pid = "%04x".format(dispositivo.productId)
        // Localiza o nó sysfs pelo par VID:PID e alterna o atributo 'authorized'.
        val script = """
            for d in /sys/bus/usb/devices/*; do
              [ -f "${'$'}d/idVendor" ] || continue
              if [ "$(cat ${'$'}d/idVendor)" = "$vid" ] && [ "$(cat ${'$'}d/idProduct)" = "$pid" ]; then
                echo 0 > ${'$'}d/authorized && sleep 1 && echo 1 > ${'$'}d/authorized && exit 0
              fi
            done
            exit 1
        """.trimIndent()
        val ok = Root.executar(script)
        Log.i(TAG, "reenumeração de $vid:$pid ${if (ok) "disparada" else "falhou"}")
        return ok
    }
}
