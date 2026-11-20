# Stick response curve: research notes

Research for a stick "response curve" editor. Sources: the decompiled Space Station 3.4.9.5
(`research/spacestation/*`, dumped with `research/re-tools/ildump.py <assembly> il '<regex>'`), the profile dumps in
`backups/`, and `ui/src/lib/protocol/config.ts`. Nothing was written to the controller.

Evidence is cited as `Assembly · Class::Method @ IL offset`. The exe is `FlydigiSpaceStation.exe`, the library
`LibCommon.dll`. Confidence tags used throughout:

- **[C] confirmed in decompile**: read directly from IL.
- **[I] inferred**: follows from the code, not seen on hardware or stated anywhere.
- **[U] unknown**.

Nothing in this document has been checked on the controller. The "Hardware check" at the end is the step that turns
the firmware-side claims into facts.

---

## 1. Summary

- The Vader 4 Pro (device id 85) takes Space Station's **"V31" stick-curve path**. That path writes **both** blocks:
  block A (`109`/`116`, 7 bytes) **and** block B (`790`/`802`, 12 bytes). [C]
- The curve is a **piecewise-linear curve with 4 corners**: start → P0 → P1 → end, then flat to the edge.
  - Start = `(deadzone, 0)` or, with anti-deadzone, `(0, antiDeadzone)`.
  - End = `(100 − outer, 100)` or, with a capped maximum, `(100, 100 − cap)`. [C]
- Block B's 9 bytes are **that same curve sampled** at input 0, 12, 25, 37, 50, 62, 75, 87 and 100 %. Each byte is
  output % + 50, so linear is `50 62 75 87 100 112 125 137 150`. Block B adds no information beyond block A and the
  edge byte; it is a precomputed lookup table. [C]
- **Curve type** (byte 0 of both blocks): 0 Default (linear), 1 Fast ("Immediate"), 2 Delay, 3 Custom. A 4th button,
  "Classic", exists but is hidden for this pad. [C]
- **Deadzone byte (110/117) is signed.** Positive values are an inner deadzone; negative values are an anti-deadzone.
  **The edge byte (801/813) is signed too**: positive values are an outer deadzone, negative values cap the maximum
  output. Both use 0..127 = 0..100 %. [C for the app's encoder; I that the firmware reads them as int8]
- Which block the **firmware** actually evaluates is not in the app. [U] That is the main open question; the hardware
  check answers it.
- Triggers have only the 7-byte block. There is no second block for triggers. [C]
- The profile has no checksum. No other flag has to change together with these bytes. [C for the app's encoder]
- **Verdict:** a drag-the-points editor (2 points, plus deadzone/anti-deadzone and outer/cap sliders) is well specified
  and safe to build. It writes both blocks consistently, exactly as Space Station does. Treat it as unverified until
  the 2-minute hardware check confirms that the output changes. **Arbitrary 9-point drawing is not supported:** the
  official app never writes a table that is not derived from P0/P1.

---

## 2. Which code path applies to the Vader 4 Pro

| Claim | Evidence | Conf. |
|---|---|---|
| Curve UI branch is gated by `GamePadVersionUtils.IsSupportV31Config(device)` | exe · `BaseGamePadModel::CalculateCurvePoints @0012`, `ExecutePointSliderDragCompletedCommand @0012`, `<InitUIData>d__15/18` | C |
| `IsSupportV31Config` = device id in `F4Serial` or `IsHSH` (102) or FP3/FP4 serial | LibCommon · `GamePadVersionUtils::IsSupportV31Config` | C |
| `F4Serial = {85, 91, 105}` (array init blob `C1B8D864…`, read via FieldRVA). 85 = 0x55 = this controller | LibCommon · `GamePadVersionUtils::.cctor @0114..0125` | C |
| The view model is `ViewModels.GamePad.BaseGamePadModel`. `BaseSwitchModel` is an identical copy for Switch-mode pads | exe | C |
| "Classic" preset hidden: `InitPageInstance` sets `IsShowJoystickClassicType = false` | exe · `BaseGamePadModel::InitPageInstance @000e` | C |

Note: this is 3.4.9.5. The 4.2.0.9 installer in `research/vendor` was carved this session. Its first LZMA chunk holds
only the .NET runtime and a service. The second chunk (offset 0xC24D96A, 36 MB) does not decompress with
`carve.py`; it may be encrypted. So **4.2.0.9's curve code was not examined**. [U] The Android Game Center APK is
Flutter AOT, and its strings contain no curve fields.

---

## 3. Byte-level spec

### 3.1 Block A: `JoyStickCurve` first part (left 109..115, right 116..122)

Encoder: LibCommon · `GamepadConfigUtilsV3::GetJoyMappingList` writes, per stick:
`(byte)Type, (byte)Zero, (byte)Point0_X, (byte)Point0_Y, (byte)Point1_X, (byte)Point1_Y, (byte)End` (each `conv.u1`).
[C]

| Off | Field (decompile) | Meaning | Units / range | Conf. |
|---|---|---|---|---|
| +0 | `Type` | Curve preset index, = `SelectedCurveTypeIndex` (see §4) | 0..3 | C |
| +1 | `Zero` ("deadzone") | Signed "centre". >0 inner deadzone, <0 anti-deadzone | int8, ±127 = ±100 % (`round(pct·127/100)`) | C (app); I (firmware reads int8) |
| +2 | `Point0_X` | Control point 1, input | 0..127 = 0..100 % of full tilt, **absolute** (already includes the deadzone offset) | C |
| +3 | `Point0_Y` | Control point 1, output | 0..127 | C |
| +4 | `Point1_X` | Control point 2, input | 0..127 | C |
| +5 | `Point1_Y` | Control point 2, output | 0..127 | C |
| +6 | `End` | Not touched by the V31 UI. Factory 127. Preserve it | 0..127 | C (never set for sticks); meaning U |

Decoder quirks (`GamepadConfigUtilsV3::GetJoyMappingByListByte @0031..00bc`) [C]:
- `P0X = max(Zero, raw[2])`
- `P1X = max(P0X, raw[4])`
- `P1Y = max(P0Y, raw[5])`

So the app enforces monotonic control points on load. It reads `Zero` as an **unsigned** byte, so a negative
(anti-deadzone) value written by its own encoder comes back as 129..255. That is a Space Station round-trip bug: the
`max()` above would then push P0X to ≥129. **VaderDaddy must decode bytes 110/117 as int8.** [C bug; I intent]

Units: `JoystickDataConvert` constants are `GamepadMaxValue = 127`, `ShowMaxMaxValue = 100` (percent) and
`UIMaxMaxValue = 250` (px). [C, `JoystickDataConvert::.cctor`]
- `GamepadToShowData(v) = round(v·100/127)`
- `ShowDataToGamepadData(p) = round(p·127/100)`
- `Math.Round` is banker's rounding. [C]

### 3.2 Block B: "joystick extra data" (left 790..801, right 802..813)

Encoder: `GamepadConfigUtilsV3::GetJoyMappingExtraDataList` writes, per stick:
`(byte)Type, Points[0..8], RoundType, (byte)Edge`, then pads to a multiple of 10 with FF (814..819). [C]
Decoder: `GetJoyMappingByListByte` reads `RoundType = extra[10]`, `Points = extra[1..9]`, `Edge = extra[11]` (right:
22, 13..21, 23). It **ignores `extra[0]`**: the type is taken from block A. [C]

| Off | Field | Meaning | Units / range | Conf. |
|---|---|---|---|---|
| +0 | `Type` (copy) | Same value as block A +0 | 0..3 | C |
| +1..+9 | `Points[0..8]` | Curve output sampled at input x = ⌊100·i/8⌋ % = 0, 12, 25, 37, 50, 62, 75, 87, 100 | byte = ⌊output % + 50⌋. 50 = 0 %, 150 = 100 %. Valid 50..150 | C |
| +10 | `RoundType` | Circularity: 0 square, 1 circular | 0/1 | C (already in config.ts) |
| +11 | `Edge` | Signed outer edge. >0 outer deadzone (full output reached at 100−edge %), <0 caps the max output at 100−\|edge\| % | int8, ±127 = ±100 % | C (app); I (firmware int8) |

Why +50: the encoder adds 50 before `conv.u1` (`CalculateCurvePoints @0379: ldc.r8 50.0; add; conv.u1`). [C] The
x grid is not stored; it is implied by the loop `100*i/8` with integer division (`@0240..0246`). [C] Why Flydigi
chose the +50 offset is [U]. It may leave room for values below 0 %; the UI never produces any.

Sampling algorithm (exact; `BaseGamePadModel::CalculateCurvePoints`, exe) [C]. All values in percent:
`start=(sx,sy)`, `P0=(x0,y0)`, `P1=(x1,y1)`, `end=(ex,ey)`.

```
for i in 0..8:
  x = (100*i) / 8            // integer: 0,12,25,37,50,62,75,87,100
  if x <= sx:      y = (Zero < 0) ? round(|Zero|*100/127) : 0      // anti-deadzone level, or 0 inside deadzone
  elif x <= x0:    y = lerp(start, P0, x)
  elif x <= x1:    y = lerp(P0, P1, x)
  elif x <  ex:    y = lerp(P1, end, x)
  else:            y = ey
  Points[i] = (byte)(y + 50)       // truncation toward zero
lerp(a,b,x) = a.y + (b.y-a.y)*(x-a.x)/(b.x-a.x), or a.y if a.x == b.x
start = (max(c,0), max(-c,0)),  end = (e>=0 ? 100-e : 100,  e>=0 ? 100 : 100+e)    // c = centre %, e = edge %
```

There is one degenerate-case tweak (`@01c4..0223`): if `P1x ≤ P0x`, `P0y < P1y` and P0x is 0 (or 100), one point is
collapsed onto the other. A sane editor never produces this.

The app computes P0/P1 in **UI pixels** (250 px = 100 %). The points come from the dragged pixel positions,
`(px+15)·100/250`, not from the stored 0..127 values. So the official table can differ by ±1 from one recomputed from
the stored P0/P1. This does not matter (§5).

### 3.3 Triggers (123..129 left, 130..136 right)

`GetTriggerMappingList` writes the same 7-field `Curve` shape: `Type, Zero, P0X, P0Y, P1X, P1Y, End`. Its scale is
0..255 (factory `00 00 00 00 FF FF FF`). [C] `ConvertGPConfigByByte` reads triggers only from 123(14), 185(40) and
154(29). **There is no 9-point table and no edge byte for triggers.** [C] The trigger UI (`TriggerLinearViewModel`,
`TriggerK1ViewModel`) edits `Zero` (start of travel) and `End` (end of travel) with drag handles. Trigger curves are
out of scope here.

### 3.4 Neighbouring bytes (do not touch)

`830..835` (`00 3f 3f 7f 7f 7f`): the V3 decoder passes `list.GetRange(830, 6)` to `GetMotionMappingByListByte`
together with the gyro block 137..144. So it is the **motion (gyro) curve**, not a third stick curve. [C that the
decoder reads it there; the field mapping inside is not traced, I] The 3.4.9.5 encoder does not write it (per
VADER_HANDOFF.md).

---

## 4. Presets (official values)

Encoded by `BaseGamePadModel::ExecuteAdjustCurveCommand` (left) and `ExecuteAdjustRightCurveCommand` (right; same
numbers). The command parameter strings come from the BAML radio buttons `default`, `classic`, `fast`, `delay` and
`custom`, labelled `Joystick_Default`, `Joystick_Classic`, `Joystick_Immediate`, `Joystick_Delay` and
`Joystick_Customizable`. [C]

Each preset sets centre = 0 and edge = 0, then sets P0 = `((0+128)·0.5 = 64, Y)` and P1 = UI 235 px, which is 127/127.
The stored values go through `UIToGamepadData(GamepadToUIData(v))`, which round-trips to the same number. [C]

| Preset | Type | Block A (+0..+6) | Block B points (+1..+9) | Edge | Conf. |
|---|---|---|---|---|---|
| Default (linear) | 0 | `00 00 40 40 7F 7F <End>` | `50 62 75 87 100 112 125 137 150` | 0 | C (bytes); points computed from the C algorithm |
| Fast ("Immediate") | 1 | `01 00 40 60 7F 7F <End>` | `50 68 88 106 126 131 138 143 150` | 0 | same |
| Delay | 2 | `02 00 40 20 7F 7F <End>` | `50 55 62 68 74 92 112 130 150` | 0 | same |
| Custom | 3 | whatever the user dragged | derived (§3.2) | user | C |
| Classic (hidden) | unchanged | `.. 00 40 40 7F 7F ..` | linear | 0 | C (not reachable for this pad) |

`<End>` is not written by the UI. Keep whatever is there (factory 127).

Factory profile: `00 00 3F 3F 7F 7F 7F` + `00 50 62 75 87 100 112 125 137 150 00 00`, i.e. P0 = 63/63 (firmware
default, not the app's 64). It is the same linear curve. All backups in `backups/` show it.

The point rows were generated with a Python re-implementation of the IL: integer-percent control points via
`GamepadToShowData`, px quantisation, banker's rounding. Fast P0 = (50 %, 76 %); Delay P0 = (50 %, 24.8 %). These
numbers are [I] until compared with a profile saved by Space Station, but the algorithm they come from is [C].

---

## 5. How the official UI maps user input to bytes

Screen (BAML around `AdjustCurveCommand`):
- A 250×250 grid with 2 draggable points (`Point1`, `Point2`) and 3 line segments (`Line1..3`).
- 5 radio buttons.
- Two bipolar sliders, "Center" (`Joystick_Center`, bound to `JoyCenter`) and "Edge" (`Joystick_Edge`, bound to
  `JoyEdge`). Both are a `CustomSlider` whose value is negative left of the middle (`CustomSlider::UpdateColorZones`,
  `@0082: -1·width`). [C]

| User action | What changes | Evidence | Conf. |
|---|---|---|---|
| Pick a preset | Type, P0, P1 set as in §4; centre and edge reset to 0; Points recomputed | `ExecuteAdjustCurveCommand` | C |
| Drag P0 | P0 clamped: `centre% ≤ x ≤ P1.x` and `antiDZ ≤ y ≤ P1.y`. Stored P0 updated live. **Type := 3** | `ExecuteDragDeltaPoint1Command @0033..01c9` | C |
| Drag P1 | P1 clamped: `P0.x ≤ x ≤ 100−edge` and `P0.y ≤ y ≤ end.y`. Stored P1 updated. **Type := 3** | `ExecuteDragDeltaCommand @0033..0236` | C |
| Release mouse | `CalculateCurvePoints` for **both** sticks, then save config | `ExecutePointSliderDragCompletedCommand @0019..0192` | C |
| Move Center/Edge slider, release | `Zero = round(c·127/100)`, `Edge = round(e·127/100)`. P0/P1 **rescaled** into the [centre, 100−edge] window (x) and [antiDZ, cap] window (y) by `CalculateNewPoints`, written back to P0/P1. Points recomputed. **Type := 3** | `ExecuteJoyZoneEdgeCompletedCmd`, `UpdatePointByZeroEdge`, `CalculateNewPoints` | C |
| Limit rule | `|edge + centre| ≤ 100` (the other one is clamped) | `CheckJoyLimitRule` | C |
| Slider range / step | about −100..+100, 1 % per step (210 px slider, ±1 buttons) | `CustomSlider`, BAML `CustomSliderWidth 210` | I |
| Point resolution | 1 UI px = 0.4 %. Stored to 0..127 via `round((px+15)·127)/250` | `JoystickDataConvert::UIToGamepadData` | C |

`CalculateNewPoints(a, b, c, e)`, applied to x with (c, e) and to y with (−c, −e) [C]:
`a' = max(c,0) + a/100 · (100 − max(e,0) − max(c,0))` (float32, truncated to int).
Because the app applies it to already-rescaled values, repeated slider moves compound. The editor should not copy
this: keep P0/P1 absolute and only clamp them.

Both blocks are always written together and consistently. The encoder emits both from the same `JoyStickCurve`
object on every save, and the type byte is written to both. [C] On load, the app does **not** recompute the points.
Stale points read from the device are saved back unchanged until the user touches the curve. [C]

Space Station side issues worth knowing [C]:
- `ExecuteDragCompletedCommand` writes the **right** stick's Type from the left stick's index.
- `set_JoyCenter(v)` with v < 0 skips storing `Zero` until the slider is released.

Not relevant to the bytes.

---

## 6. Risks when writing these bytes

1. **Which block the firmware uses is unknown.** [U]
   - The edge byte and RoundType live only in block B, and RoundType was written and read back on this pad.
     So the firmware at least parses block B. [I]
   - The deadzone lives only in block A (and implicitly in point 0..n of B).
   - Possibilities:
     - (a) B's table drives output and A is legacy.
     - (b) A drives output and B is unused.
     - (c) The type byte selects a built-in curve and only Custom (3) uses the stored shape.

   **Always write both consistently**, as the official app does. Then all three possibilities give the intended
   curve.
2. **Signedness.** Writing a negative centre or edge as int8 matches the official encoder. Whether the firmware treats
   it as anti-deadzone/cap or as a huge positive value is [U]. Gate anti-deadzone and the cap behind the hardware
   check.
3. **The existing VaderDaddy deadzone control writes only byte 110.** Under possibility (a), that edit does nothing,
   because the table still says linear. Under (b) it works. Under the official model, a deadzone also zeroes the
   first table entries. The curve codec should own byte 110 and the table together.
4. **Space Station interop.** If a user later opens the profile in Space Station 3.4.9.5, a negative byte 110/117
   decodes as unsigned and P0X gets `max()`-ed to ≥129 (§3.1). That is cosmetic in their app, but re-saving from
   there could write garbage. Low priority.
5. **No checksum or version coupling.**
   - Profile parcels carry no checksum.
   - The save command's checksum covers only the command bytes.
   - 225..226 is the save version, rewritten by `50 03`.
   - No "custom enabled" flag exists outside the two blocks; the type byte is the only selector. [C for the app]
6. Over the dongle, keep the existing rule: after an `EA` write, wait about 6 s before the next command (handoff).

---

## 7. Proposed TypeScript codec

Lives next to `config.ts`, e.g. `ui/src/lib/protocol/curve.ts`. Percent is the editor's unit; bytes are 0..127.

```ts
export type Side = 'left' | 'right';
export enum CurveType { Default = 0, Fast = 1, Delay = 2, Custom = 3 }

export interface Pt { x: number; y: number }          // percent, 0..100

export interface StickResponse {
  type: CurveType;            // A+0 (== B+0)
  deadzone: number;           // %, 0..100  (A+1 when >= 0)
  antiDeadzone: number;       // %, 0..100  (A+1 when < 0, as |value|)  — deadzone and antiDeadzone are exclusive
  outer: number;              // %, 0..100  (B+11 when >= 0): full output reached at 100 - outer
  cap: number;                // %, 0..100  (B+11 when < 0): max output = 100 - cap  — outer and cap are exclusive
  p0: Pt; p1: Pt;             // absolute % (A+2..5)
  // read-only extras
  table: number[];            // B+1..9 as output % (byte - 50)
  tableMatches: boolean;      // B+1..9 equals samplePoints(this)  (false => written by something else)
  typeMatches: boolean;       // A+0 == B+0
  rawEnd: number;             // A+6, preserved
}

const A = { left: 109, right: 116 } as const;
const B = { left: 790, right: 802 } as const;
const i8 = (b: number) => (b > 127 ? b - 256 : b);
const u8 = (v: number) => (v < 0 ? v + 256 : v) & 0xff;
const toPct = (v: number) => Math.round((v * 100) / 127);
const toRaw = (p: number) => Math.round((p * 127) / 100);

export function decodeResponse(raw: Uint8Array, side: Side): StickResponse;
export function encodeResponse(raw: Uint8Array, side: Side, c: StickResponse): Uint8Array; // returns a copy
export function samplePoints(c: StickResponse): number[];   // 9 bytes, §3.2 algorithm
export function preset(t: CurveType.Default | CurveType.Fast | CurveType.Delay): Pick<StickResponse, 'type'|'deadzone'|'antiDeadzone'|'outer'|'cap'|'p0'|'p1'>;
export function clampResponse(c: StickResponse): StickResponse; // enforce §5 constraints
```

**decodeResponse**:
- `zero = i8(raw[A+1])` and `edge = i8(raw[B+11])`.
- `deadzone = max(zero, 0)` → percent; `antiDeadzone = max(-zero, 0)` → percent. Same for edge → outer/cap.
- `p0 = {x: toPct(raw[A+2]), y: toPct(raw[A+3])}`, likewise p1.
- `table = raw[B+1..B+9] - 50`.
- `tableMatches` = equal to `samplePoints(decoded)` within ±1 per entry; the official app's pixel maths can differ
  by 1.

**clampResponse** (mirrors the official limits):
- `deadzone + outer ≤ 100` and `antiDeadzone + cap ≤ 100`
- `deadzone ≤ p0.x ≤ p1.x ≤ 100 − outer`
- `antiDeadzone ≤ p0.y ≤ p1.y ≤ 100 − cap`
- deadzone and antiDeadzone are never both > 0 (one signed byte); same for outer and cap.

**encodeResponse** writes exactly these bytes and nothing else (offsets for left; right = +7 for A, +12 for B):

| Byte | Value |
|---|---|
| 109 | `type` |
| 110 | `u8(antiDeadzone > 0 ? -toRaw(antiDeadzone) : toRaw(deadzone))` |
| 111, 112 | `toRaw(p0.x)`, `toRaw(p0.y)` |
| 113, 114 | `toRaw(p1.x)`, `toRaw(p1.y)` |
| 115 | **unchanged** (End) |
| 790 | `type` |
| 791..799 | `samplePoints(c)` (each `floor(y + 50)`, 50..150) |
| 800 | **unchanged** (RoundType; owned by the existing circularity switch) |
| 801 | `u8(cap > 0 ? -toRaw(cap) : toRaw(outer))` |

`samplePoints` uses the §3.2 algorithm with:
- `start = (deadzone, antiDeadzone)`
- `P0`, `P1` = `toPct(toRaw(p))` (integer percent, like the app)
- `end = (100 − outer, 100 − cap)`
- the anti-deadzone level for `x ≤ start.x` = `antiDeadzone`

Unit test: `preset(Default|Fast|Delay)` must give the §4 rows, and factory bytes must decode to Default with
`tableMatches`.

Type rule: when the user drags a point or moves a slider, set `type = Custom` (3), as Space Station does. Picking a
preset sets 0/1/2 and resets deadzone, outer, anti-deadzone and cap to 0.

Editor scope this supports with confidence:
- 2 draggable points.
- An inner deadzone slider and an outer slider.
- The 3 presets.
- A live preview of the 9-point table.

Anti-deadzone and the max-output cap use the same bytes with negative values. Keep them hidden until hardware
check 3 below passes.

---

## 8. Hardware check (about 2 minutes, needs someone to move the sticks)

Goal: find out which block changes the output. Each step edits **only the left stick**; the right stick stays factory
and is the control. Watch the "Live input" panel (lx vs rx). Tilt both sticks **together by the same amount**
(thumbs mirrored, about half-way), then fully.

Prepare (Claude can do this beforehand, read-only on the controller apart from the writes below):

```sh
vader backup                                   # safety copy
BASE="$HOME/Library/Application Support/VaderDaddy/backups/$(vader backups | tail -1)"
python3 - "$BASE" <<'EOF'
import sys, shutil
b = sys.argv[1]; p = bytearray(open(b + ".profile.bin", "rb").read())
def mk(name, edits):
    q = bytearray(p)
    for off, vals in edits: q[off:off+len(vals)] = bytes(vals)
    open(f"/tmp/vd-{name}.profile.bin", "wb").write(q); shutil.copy(b + ".led.bin", f"/tmp/vd-{name}.led.bin")
# T1: table only — dead until ~87 % tilt, then full. Block A stays linear. Type 3 in both blocks.
mk("t1", [(109, [3]), (790, [3, 50,50,50,50,50,50,50,50,150])])
# T2: block A only — P0 at (50 % in, 5 % out). Table stays linear. Type 3 in both blocks.
mk("t2", [(109, [3, 0, 64, 6, 127, 127]), (790, [3])])
# T3: type only — "Fast" type byte, everything else linear.
mk("t3", [(109, [1]), (790, [1])])
EOF
```

Run, one at a time (cable or XInput dongle; wait about 6 s after each before touching the app):

| Step | Command | Half tilt: left vs right | Means |
|---|---|---|---|
| T1 | `vader restore /tmp/vd-t1` | left ≈ 0.0, right ≈ 0.5 | **The 9-point table drives output** |
| | | left ≈ right | Table not used (or not with type 3) |
| T2 | `vader restore /tmp/vd-t2` | left ≈ 0.05, right ≈ 0.5 | **Block A's P0/P1 drive output** |
| | | left ≈ right | Block A not used |
| T3 | `vader restore /tmp/vd-t3` | left clearly above right (≈ 0.75 vs 0.5) | Firmware has built-in presets keyed by type |
| | | left ≈ right | Type byte is only a UI label |
| Done | `vader restore "$BASE"` (the backup made first; `latest` no longer points at it because every restore makes its own `before-restore` backup) | equal | restored |

Full tilt should read about 1.0 on both sticks in every step. If T1 and T2 both show a change, the firmware uses both
blocks, and the codec's "always write both" rule is required, not just tidy.

Optional T4, only after T1 or T2 passes: make an anti-deadzone copy with `encodeResponse` (antiDeadzone 10 %). That
gives `110 = 0xF3` (−13) and a table starting at `60`, i.e. 10 % output at zero tilt. A tiny nudge on
the left stick should jump to about 0.10 instead of creeping up from 0. That confirms the int8 reading of byte 110.
