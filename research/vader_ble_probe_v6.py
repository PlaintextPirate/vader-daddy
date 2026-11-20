#!/usr/bin/env python3
"""
Vader 4 Pro BLE probe v6 (read-only: only sends "get controller ID", A5 A0 00 00).

Tests the two write types against the Nordic UART TX characteristic, on the connection macOS
already holds (no disconnect from Settings needed):
  1. write WITHOUT response (what Flydigi's Android app does)  -> does a notify reply arrive?
  2. write WITH response                                        -> reply arrives? ATT response?
Never touches the 00010203-... firmware-update service.

Run from Terminal.app:  .venv/bin/python vader_ble_probe_v6.py
"""
import asyncio
import sys
import time

from bleak import BleakAdapter, BleakClient, BleakScanner

NUS_SVC = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
NUS_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
NUS_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
GET_ID = bytes([0xA5, 0xA0, 0x00, 0x00])
t0 = time.monotonic()
wall0 = time.time()


def log(msg: str) -> None:
    print(f"{time.monotonic() - t0:7.2f}s  {msg}", flush=True)


async def find():
    adapter = await BleakAdapter.get()
    for d in await adapter.get_connected_devices(frozenset({NUS_SVC, "1812", "180a"})):
        if (d.name or "").startswith("Flydigi VADER4"):
            log(f"Using system-connected {d.name} ({d.address})")
            return d
    log("Not system-connected; scanning 15 s…")
    return await BleakScanner.find_device_by_filter(
        lambda d, ad: (d.name or ad.local_name or "").startswith("Flydigi VADER4"), timeout=15
    )


async def main() -> None:
    do_confirmed = "--confirmed" in sys.argv
    log(f"probe v6  wallclock={time.strftime('%H:%M:%S', time.localtime(wall0))}  confirmed={do_confirmed}")
    dev = await find()
    if not dev:
        log("Controller not found.")
        return
    gone = asyncio.Event()

    def on_disc(_c):
        log("!! link/handle disconnected")
        gone.set()

    async with BleakClient(dev, disconnected_callback=on_disc, timeout=15) as client:
        replies = []

        def on_notify(_ch, data: bytearray) -> None:
            replies.append(bytes(data))
            log(f"<- {data.hex(' ')}")

        await client.start_notify(NUS_RX, on_notify)
        p = client._backend._peripheral
        log(f"notify on; canSendWriteWithoutResponse={bool(p.canSendWriteWithoutResponse())}")

        for i in range(3):
            n = len(replies)
            log(f"-> {GET_ID.hex(' ')}  WITHOUT response #{i + 1}")
            try:
                await asyncio.wait_for(client.write_gatt_char(NUS_TX, GET_ID, response=False), 2)
                log("   call returned OK")
            except Exception as e:  # noqa: BLE001
                log(f"   error: {type(e).__name__}: {e}")
            await asyncio.sleep(1.0)
            log(f"   replies: {len(replies) - n}")

        if do_confirmed and client.is_connected:
            n = len(replies)
            log(f"-> {GET_ID.hex(' ')}  WITH response")
            try:
                await asyncio.wait_for(client.write_gatt_char(NUS_TX, GET_ID, response=True), 5)
                log("   ATT write response received")
            except asyncio.TimeoutError:
                log("   no ATT write response within 5 s")
            except Exception as e:  # noqa: BLE001
                log(f"   error: {type(e).__name__}: {e}")
            log(f"   replies: {len(replies) - n}")
            # Is the bearer stalled? A plain read should answer instantly if not.
            try:
                t = time.monotonic()
                await asyncio.wait_for(client.read_gatt_char("00002a19-0000-1000-8000-00805f9b34fb"), 5)
                log(f"   battery read OK in {time.monotonic() - t:.2f}s (bearer alive)")
            except Exception as e:  # noqa: BLE001
                log(f"   battery read failed: {type(e).__name__} (bearer stalled)")
        log("still connected" if client.is_connected else "connection lost")
    log("done")


if __name__ == "__main__":
    asyncio.run(main())
