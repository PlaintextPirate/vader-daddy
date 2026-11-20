#!/usr/bin/env python3
"""
Vader 4 Pro Bluetooth LE probe (read-only).

Checks whether the controller's Nordic UART config channel stays connected when driven
through macOS CoreBluetooth directly (the same Bluetooth stack an iPhone app would use).

Sends only the "get controller ID" query (A5 A0 00 00) from Flydigi's Android app.
Nothing is written to the controller's settings.

Run:
    python3 -m pip install bleak
    python3 vader_ble_probe.py

Controller: switch on the back in the phone position, powered on.
macOS will ask Terminal for Bluetooth access the first time. Allow it.
"""
import asyncio
import logging
import time

logging.basicConfig(level=logging.WARNING, format="         [%(name)s] %(message)s")

from bleak import BleakAdapter, BleakClient, BleakScanner

NAME = "Flydigi VADER4P"
NUS_SVC = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
NUS_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  # write
NUS_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  # notify
FW_REV = "00002a26-0000-1000-8000-00805f9b34fb"
GET_ID = bytes([0xA5, 0xA0, 0x00, 0x00])

t0 = time.monotonic()


def log(msg: str) -> None:
    print(f"{time.monotonic() - t0:7.2f}s  {msg}", flush=True)


async def main() -> None:
    log("probe v5 (v4 + system-connected lookup): GATT table + write-without-response on any characteristic that allows it")
    # v5: macOS already holds the controller as a BLE HID device, so it doesn't advertise.
    # Ask CoreBluetooth for already-connected peripherals first, then fall back to scanning.
    dev = None
    adapter = await BleakAdapter.get()
    for d in await adapter.get_connected_devices(frozenset({NUS_SVC, "1812", "180a"})):
        log(f"System-connected peripheral: {d.name} ({d.address})")
        if (d.name or "").startswith("Flydigi VADER4"):
            dev = d
    if not dev:
        log(f"Scanning for '{NAME}' (10 s)…")
        dev = await BleakScanner.find_device_by_filter(
            lambda d, ad: (d.name or ad.local_name or "").startswith("Flydigi VADER4"), timeout=10
        )
    if not dev:
        log("Not found (neither system-connected nor advertising).")
        return
    log(f"Found {dev.name} ({dev.address})")

    disconnected = asyncio.Event()

    def on_disconnect(_client: BleakClient) -> None:
        log("!! DISCONNECTED by the other side")
        disconnected.set()

    async with BleakClient(dev, disconnected_callback=on_disconnect, timeout=15) as client:
        log(f"Connected. MTU={client.mtu_size}")
        try:
            fw = await client.read_gatt_char(FW_REV)
            log(f"Firmware: {fw.decode(errors='replace')}")
        except Exception as e:  # noqa: BLE001
            log(f"Firmware read failed: {e}")

        def on_notify(_char, data: bytearray) -> None:
            log(f"<- {data.hex(' ')}")

        log("GATT table:")
        nr_targets = []
        for svc in client.services:
            log(f"  service {svc.uuid}")
            for ch in svc.characteristics:
                log(f"    char {ch.uuid}  handle {ch.handle}  {','.join(ch.properties)}")
                # Never write to the 00010203-… service (firmware update): a stray write drops the link.
                if "write-without-response" in ch.properties and not ch.uuid.startswith("00010203"):
                    nr_targets.append(ch)

        await client.start_notify(NUS_RX, on_notify)
        log("Notifications on")

        if not nr_targets:
            log("No characteristic allows write-without-response.")
        for ch in nr_targets:
            log(f"-> {GET_ID.hex(' ')}   (write without response to {ch.uuid})")
            try:
                await asyncio.wait_for(client.write_gatt_char(ch, GET_ID, response=False), timeout=1.0)
                log("   sent")
            except Exception as e:  # noqa: BLE001
                log(f"   write error: {type(e).__name__}: {e}")
            await asyncio.sleep(1.5)

        try:
            p = client._backend._peripheral
            log(f"CoreBluetooth canSendWriteWithoutResponse={bool(p.canSendWriteWithoutResponse())} "
                f"maxLen(noRsp)={p.maximumWriteValueLengthForType_(1)} maxLen(rsp)={p.maximumWriteValueLengthForType_(0)}")
        except Exception as e:  # noqa: BLE001
            log(f"CoreBluetooth introspection failed: {e}")

        log("Still connected ✓" if client.is_connected else "Connection lost ✗")

    log("Done. Paste this whole output back to Claude.")


if __name__ == "__main__":
    asyncio.run(main())
