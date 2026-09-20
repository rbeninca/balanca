package br.edu.ifsc.balancagfig.serial

import android.hardware.usb.UsbDevice
import android.util.Log
import br.edu.ifsc.balancagfig.sistema.Root

/**
 * Concede a permissão USB da balança sem diálogo, nos boxes com root.
 *
 * O Android libera um dispositivo USB para um app de duas formas: pelo
 * diálogo de permissão ou pelo evento USB_DEVICE_ATTACHED resolvido para o
 * filtro do app (res/xml/filtro_usb.xml). No quiosque não há quem clique no
 * diálogo, então forçamos o evento: desenumerar o conversor faz o UsbService
 * disparar ATTACHED e, como só este app casa com o filtro, ele recebe o
 * intent — e a permissão — já concedidos.
 *
 * Como desenumerar depende do kernel, o script tenta dois caminhos:
 *
 *  1. **Alternar `authorized` (0 → 1) do conversor.** Funciona no TX9/Amlogic,
 *     cujo kernel derruba e recria o nó /dev/bus/usb ao desautorizar. Mexe só
 *     no conversor da balança, então é o preferido.
 *  2. **unbind/bind da controladora do barramento.** Necessária no RK322x/MXQ:
 *     ali o kernel apenas reautoriza o device no lugar, o nó não some, o
 *     Android não vê attach nenhum e a permissão nunca chega. Derruba o
 *     barramento inteiro por ~1 s (os outros devices dele reenumeram junto).
 *
 * O caminho 1 é conferido na hora (o nó sumiu?); o 2 só entra quando ele não
 * surtiu efeito. Assim o mesmo código serve aos dois firmwares.
 */
object AutorizacaoUsb {
    private const val TAG = "AutorizacaoUsb"

    /**
     * Desenumerar [dispositivo] via sysfs. Devolve true se o comando rodou; a
     * permissão em si chega depois, pelo broadcast ATTACHED.
     */
    fun reenumerar(dispositivo: UsbDevice): Boolean {
        val vid = "%04x".format(dispositivo.vendorId)
        val pid = "%04x".format(dispositivo.productId)
        // deviceName é /dev/bus/usb/006/002; o root hub no sysfs é usb6 (sem zeros).
        val barramento = dispositivo.deviceName
            .substringBeforeLast('/')
            .substringAfterLast('/')
            .toIntOrNull()
        if (barramento == null) {
            Log.w(TAG, "não entendi o deviceName '${dispositivo.deviceName}'")
            return false
        }

        val script = """
            VID=$vid
            PID=$pid
            NO=${dispositivo.deviceName}
            BUS=$barramento

            # 1) toggle de 'authorized' (TX9/Amlogic)
            for d in /sys/bus/usb/devices/*; do
              [ -f "${'$'}d/idVendor" ] || continue
              [ "${'$'}(cat ${'$'}d/idVendor 2>/dev/null)" = "${'$'}VID" ] || continue
              [ "${'$'}(cat ${'$'}d/idProduct 2>/dev/null)" = "${'$'}PID" ] || continue
              echo 0 > ${'$'}d/authorized 2>/dev/null
              sleep 1
              sumiu=0
              [ -e "${'$'}NO" ] || sumiu=1
              echo 1 > ${'$'}d/authorized 2>/dev/null
              [ "${'$'}sumiu" = 1 ] && exit 0
              break
            done

            # 2) o kernel não desenumerou no toggle: derruba a controladora do barramento.
            #    Só se o barramento não tiver outros dispositivos — derrubar a
            #    controladora com mais gente pendurada levaria junto mouse, teclado
            #    ou até um WiFi USB (e a rede por onde corre a instalação).
            OUTROS=0
            for n in /sys/bus/usb/devices/${'$'}BUS-*; do
              case "${'$'}{n##*/}" in *:*) continue ;; esac
              [ -f "${'$'}n/idVendor" ] || continue
              [ "${'$'}(cat ${'$'}n/idVendor 2>/dev/null)" = "${'$'}VID" ] && continue
              OUTROS=1
            done
            [ "${'$'}OUTROS" = 0 ] || exit 1

            BASE=${'$'}(readlink /sys/bus/usb/devices/usb${'$'}BUS 2>/dev/null)
            CTRL=${'$'}{BASE%/usb${'$'}BUS}; CTRL=${'$'}{CTRL##*/}
            DRV=${'$'}(readlink /sys/bus/platform/devices/${'$'}CTRL/driver 2>/dev/null)
            DRV=${'$'}{DRV##*/}
            [ -n "${'$'}CTRL" ] && [ -n "${'$'}DRV" ] || exit 1
            echo "${'$'}CTRL" > /sys/bus/platform/drivers/${'$'}DRV/unbind || exit 1
            sleep 1
            echo "${'$'}CTRL" > /sys/bus/platform/drivers/${'$'}DRV/bind || exit 1
            exit 0
        """.trimIndent()

        val ok = Root.executar(script)
        Log.i(TAG, "reenumeração de $vid:$pid ${if (ok) "disparada" else "falhou"}")
        return ok
    }
}
