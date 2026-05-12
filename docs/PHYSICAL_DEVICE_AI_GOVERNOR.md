# ClawGuard Physical Device AI Governor

Saved: 2026-05-12

This is the planning track for users who want AI agents to design, modify, or operate systems connected to physical devices such as security cameras, drones, talking robot toys, embedded boards, sensors, actuators, and small robots.

The core design choice is simple:

```text
agent proposes physical action
  -> ClawGuard classifies device/action/data/risk
  -> ClawGuard checks simulation, safety, privacy, and approval evidence
  -> ClawGuard allows observe/draft/recommend work
  -> ClawGuard gates or blocks real actuation, firmware, and external upload
```

ClawGuard should be the governor and evidence layer, not the low-level flight controller, camera controller, robot controller, or firmware flasher.

## Why This Matters

Physical-device agents are more dangerous than normal software agents because mistakes can:

- move motors, propellers, wheels, servos, arms, doors, locks, or relays
- record people or private spaces
- leak video, audio, child voice data, location, or home layouts
- damage hardware
- violate aviation, privacy, safety, labor, or consumer-protection rules
- disable safety controls
- create irreversible real-world effects

This means ClawGuard needs stronger gates than normal skill scanning.

## Supported Device Families To Plan For

| Device family | Examples | Primary risk |
| --- | --- | --- |
| Security camera / NVR | IP camera, PTZ camera, Frigate, ZoneMinder, ONVIF, RTSP | privacy, surveillance abuse, credential exposure, unsafe PTZ/relay control |
| Drone / UAV | PX4, ArduPilot, MAVLink, MAVSDK, QGroundControl, companion computer | flight safety, geofence, Remote ID, propeller injury, aviation compliance |
| Talking robot toy | ESP32/Raspberry Pi toy, wake word, STT, TTS, servo, LED, speaker | child privacy, unsafe speech, runaway servo/motor, microphone recording |
| Mobile robot | TurtleBot3, ROS 2 robot, differential-drive platform | collision, unsafe navigation, battery/fire, uncontrolled motion |
| Embedded IoT device | ESP32, STM32, Arduino-class MCU, micro-ROS node, relay controller | firmware integrity, exposed MQTT/API, hardcoded secrets, unsafe relay control |
| Industrial/OT-adjacent device | PLC, robot arm, conveyor, access control, building automation | physical process disruption, safety system bypass, high assurance needs |

## Default ClawGuard Policy

Recommended MVP policy:

| Action class | Examples | Default decision |
| --- | --- | --- |
| `observe-device` | read telemetry, list cameras, inspect config | allow if local and authenticated |
| `analyze-media-local` | local object detection, local transcription | allow with privacy constraints |
| `draft-plan` | propose camera layout, robot behavior, drone mission plan | allow |
| `recommend-action` | suggest maintenance, alert owner, generate checklist | allow or manual review |
| `record-media` | enable recording, change retention, export clips | manual review |
| `send-external` | upload video/audio/telemetry to cloud model | manual review or block for sensitive spaces |
| `ptz-control` | pan/tilt/zoom camera | manual review; rate limit; audit |
| `speak-or-display` | robot toy speaks, displays text, sends notification | manual review for child-facing mode |
| `move-ground-robot` | wheels, servo, manipulator, navigation goal | simulation evidence plus human approval |
| `firmware-update` | flash MCU, update bootloader, change OTA | dual approval; rollback plan required |
| `drone-arm` | arm motors | block in MVP unless explicit lab profile |
| `drone-takeoff` | takeoff, land, offboard control | block in MVP unless simulation, geofence, pilot, and legal evidence exist |
| `disable-safety` | bypass geofence, disable Remote ID, disable failsafe | block |
| `weaponize-or-harm` | attach harmful payload, pursue/strike target | block |

## Non-Goals

ClawGuard should not:

- teach users to bypass device authentication, camera credentials, geofences, Remote ID, no-fly controls, safety interlocks, or firmware protections
- provide autonomous drone flight instructions for real outdoor flight
- provide surveillance workflows targeting people without consent or lawful authority
- claim a physical action is safe just because an LLM produced it
- approve child-facing robot speech without content, privacy, and parent/owner controls
- operate aircraft, locks, relays, robot arms, vehicles, or industrial equipment directly in the MVP

## Open-Source Ecosystem

### Robotics And Middleware

- ROS 2: robotics middleware based around nodes, topics, services, actions, parameters, launch, and the ROS graph. Useful for mobile robots, manipulators, sensors, and simulation. Source: https://docs.ros.org/en/rolling/Concepts/Basic.html
- micro-ROS: brings ROS 2 concepts to microcontrollers and connects MCU nodes to standard ROS 2 systems through an agent. Source: https://micro.ros.org/docs/overview/features/
- Gazebo Sim: open-source robotics simulator with physics, rendering, sensor models, plugins, GUI, and services. Use before real robot motion. Source: https://gazebosim.org/libs/sim/
- TurtleBot3: low-cost open-source ROS education/research robot platform. Good test target for safe indoor robotics demos. Source: https://www.ros.org/robots/turtlebot3/

### Drones And Flight Controllers

- PX4: open-source flight stack. Offboard mode lets a companion computer send position, velocity, acceleration, attitude, or thrust/torque setpoints. PX4 requires a continuous proof-of-life signal and leaves offboard if that signal stops. Source: https://docs.px4.io/v1.14/en/flight_modes/offboard
- MAVLink: protocol used for telemetry and command between vehicle, companion computer, and ground station. Offboard interfaces are commonly used for collision avoidance and external control. Source: https://mavlink.io/en/services/offboard_control.html
- MAVSDK: API for MAVLink systems. Offboard control sends velocity and yaw setpoints from a companion computer. Source: https://mavsdk.mavlink.io/main/en/cpp/guide/offboard.html
- ArduPilot/MAVProxy geofence: geofence limits where a vehicle may fly and can trigger failsafe behavior such as returning home. Source: https://ardupilot.org/mavproxy/docs/uav_configuration/geofence.html
- FAA Remote ID: in the United States, registered drones generally must comply with Remote ID rules; Remote ID broadcasts identification and location information. Source: https://www.faa.gov/uas/getting_started/remote_id

### Cameras, Video, And NVR

- ONVIF Profile T: standardized IP video features including H.264/H.265 streaming, imaging settings, motion/tampering events, metadata, PTZ, HTTPS streaming, digital I/O, and bidirectional audio. Source: https://www.onvif.org/profiles/profile-t/
- ONVIF conformant-products database: authoritative source for checking if a product is officially ONVIF conformant for a specific firmware/software version. Source: https://www.onvif.org/conformant-products/
- Frigate: local NVR for Home Assistant with OpenCV/TensorFlow object detection, MQTT integration, RTSP restreaming, and local processing. Source: https://docs.frigate.video/
- ZoneMinder: open-source video surveillance system with camera support, APIs, mobile apps, and third-party integrations. Source: https://zoneminder.com/
- OpenCV: open-source computer vision and machine learning library with object detection, tracking, recognition, and image processing algorithms. Source: https://opencv.org/about/
- GStreamer: open-source multimedia framework for building RTSP/WebRTC/media processing pipelines. Source: https://gstreamer.freedesktop.org/documentation/

### Smart Home And Messaging

- Home Assistant: local-first smart home platform with MQTT integration and device/entity automation patterns. MQTT is useful for device-state and command topics. Source: https://www.home-assistant.io/integrations/mqtt
- openHAB: open-source home automation platform built around bindings, things, items, groups, rules, and persistence. Source: https://www.openhab.org/docs/
- Node-RED: browser-based flow editor for wiring hardware devices, APIs, and online services. Useful for quick IoT prototypes. Source: https://www.node-red.dev/
- Eclipse Mosquitto: lightweight open-source MQTT broker suitable for sensors, embedded devices, and IoT messaging. Source: https://mosquitto.org/

### Voice And Talking Toys

- whisper.cpp: local C/C++ inference for Whisper ASR, optimized for many platforms including Apple Silicon, Android, Linux, WebAssembly, and CPU-only. Source: https://github.com/ggml-org/whisper.cpp
- Vosk: offline open-source speech recognition toolkit with bindings for Python, Java, Node.js, C#, C++, Rust, Go, and others; works from Raspberry Pi to servers. Source: https://github.com/alphacep/vosk-api
- Piper: local neural text-to-speech. The original `rhasspy/piper` repo is archived and points to successor work, so ClawGuard docs should note project status and voice-model licensing checks. Source: https://github.com/rhasspy/piper

### Security And Safety Standards

- NIST Cyber-Physical Systems Framework: CPS integrate computation, communication, sensing, actuation, physical systems, and humans. Source: https://www.nist.gov/publications/framework-cyber-physical-systems-volume-1-overview
- NISTIR 8259A: IoT device cybersecurity capability core baseline, including device identification, configuration, data protection, logical access, software update, cybersecurity state awareness, and device security. Source: https://www.nist.gov/publications/iot-device-cybersecurity-capability-core-baseline
- NIST IoT Cybersecurity Capabilities Catalog: expands device and manufacturer capabilities. Source: https://pages.nist.gov/IoT-Device-Cybersecurity-Requirement-Catalogs/
- ISA/IEC 62443: industrial automation and control systems cybersecurity standards covering asset owners, suppliers, integrators, service providers, lifecycle, and security levels. Source: https://www.isa.org/standards-and-publications/isa-standards/isa-iec-62443-series-of-standards
- OWASP OT Top Ten: risks from connecting operational technology with IT systems, including disruption, data theft, physical process damage, and safety impact. Source: https://owasp.org/www-project-ot-top-ten

## Skills And Knowledge Requirements

### Core Skills For Any Physical Agent Project

- systems engineering and threat modeling
- device inventory, firmware versions, and interface mapping
- networking, TLS, MQTT, RTSP, WebRTC, serial, USB, and firewall basics
- least privilege, secrets handling, API keys, and credential rotation
- event logging and evidence retention
- simulation before real-world actuation
- emergency stop, manual override, and fail-safe design
- rollback or quarantine plan
- privacy impact review for audio/video/location data
- clear human approval points

### Security Camera Agent

Required knowledge:

- ONVIF profiles, RTSP streams, camera users/roles, PTZ permissions
- NVR concepts: retention, motion detection, event clips, masks, zones
- privacy rules: consent, signage, retention, restricted areas, audio recording
- local analytics: OpenCV, Frigate, object detection, false positives
- secure storage, export controls, and redaction

ClawGuard should require:

- camera inventory and firmware version
- proof that credentials are not hardcoded
- local-processing preference for private spaces
- retention policy and export approval
- PTZ rate limits and audit logs
- blocked facial recognition or biometric identification unless explicitly governed

### Drone Agent

Required knowledge:

- PX4 or ArduPilot flight stack basics
- MAVLink/MAVSDK command and telemetry boundaries
- QGroundControl or ground-station workflow
- SITL simulation, geofence, failsafe, RC/manual override, kill switch
- aviation rules in the operating country
- battery, weather, GNSS, obstacle, and airspace safety

ClawGuard should require:

- simulation evidence before any real vehicle action
- geofence enabled
- failsafe configured
- Remote ID/compliance evidence where applicable
- trained responsible pilot/operator approval
- block offboard real flight in MVP unless explicit lab profile exists
- block disable-geofence, disable-Remote-ID, or bypass-safety requests

### Talking Robot Toy Agent

Required knowledge:

- wake word, STT, TTS, speaker pipeline
- content safety for child-facing conversations
- local audio processing and data minimization
- servo/motor PWM limits and thermal/battery constraints
- enclosure, wiring, charging, and safe materials
- parent/owner controls

ClawGuard should require:

- local-first audio mode for children or private homes
- explicit recording indicator
- no hidden microphone behavior
- content policy for child-facing speech
- servo motion envelope and speed limit
- blocked speech categories and emergency stop

### Embedded Firmware Agent

Required knowledge:

- MCU build chain, partitioning, OTA, serial flashing
- secure boot and flash encryption where supported
- firmware signing, versioning, rollback partition
- hardware interfaces: GPIO, I2C, SPI, UART, PWM, ADC
- watchdog timers and safe boot mode

ClawGuard should require:

- signed firmware manifest
- target board and firmware version
- rollback plan before flashing
- backup of current firmware/config where possible
- dual approval for firmware changes on deployed devices
- block firmware update if it disables secure boot, encryption, watchdog, or safety constraints

## Proposed ClawGuard Additions

## Implemented MVP

The first dry-run device governor is implemented:

```bash
clawguard device plan \
  --device-class drone \
  --action drone-takeoff \
  --task "Take off for outdoor inspection"
```

Machine-readable output:

```bash
clawguard device plan \
  --device-class security-camera \
  --action record-media \
  --data-class video-audio \
  --task "Enable recording on storefront camera" \
  --json
```

Current behavior:

- allows `observe-device`, `analyze-media-local`, `draft-plan`, and `recommend-action`
- manual review for `record-media`, `ptz-control`, `speak-or-display`, and `move-ground-robot`
- dual approval for `firmware-update`
- dual approval for sending sensitive device data externally
- blocks `drone-arm`, `drone-takeoff`, `disable-safety`, and `weaponize-or-harm`
- reports missing simulation, privacy, rollback, operator, geofence, failsafe, Remote ID, manual override, and emergency-stop evidence where relevant
- never sends commands to real hardware

The schema for future device-control skill manifests is:

```text
schemas/clawguard-device-skill.schema.json
```

## Future ClawGuard Additions

### 1. Device Capability Manifest

Add a manifest file that device-control skills must include:

```json
{
  "schemaVersion": "clawguard.deviceSkill.v1",
  "deviceClass": "drone",
  "deviceIds": ["lab-px4-sitl"],
  "protocols": ["mavlink"],
  "interfaces": ["udp:14540"],
  "actionClasses": ["observe-device", "draft-plan"],
  "blockedActions": ["drone-arm", "drone-takeoff", "disable-safety"],
  "dataClasses": ["telemetry"],
  "safetyEnvelope": {
    "simulationRequired": true,
    "manualOverrideRequired": true,
    "geofenceRequired": true,
    "emergencyStopRequired": true
  },
  "approval": {
    "requiredFor": ["move-ground-robot", "firmware-update", "drone-arm", "drone-takeoff"],
    "roles": ["owner", "operator", "safety-reviewer"]
  }
}
```

### 2. Physical Action Plan Command

Current CLI shape:

```bash
clawguard device plan --device-class drone --action drone-takeoff
```

Expected MVP behavior:

- allow observation and planning
- manual review for PTZ, recording, speaking, ground robot movement
- dual approval for firmware and customer/public-facing systems
- block real drone arm/takeoff/offboard control by default

### 3. Device SOP Packs

Starter SOP packs:

- `physical-devices/security-camera/privacy-review`
- `physical-devices/drone/sitl-preflight`
- `physical-devices/talking-robot-toy/child-safe-interaction`
- `physical-devices/embedded/firmware-update-readiness`

### 4. Device Risk Rules

New rule ideas:

- hardcoded camera/admin credentials
- public RTSP/ONVIF exposure
- cloud video upload without approval
- microphone recording without visible indicator
- child-facing speech without content guard
- unsafe servo/motor speed or missing limits
- firmware flashing without rollback plan
- drone arm/takeoff/offboard commands
- disabling geofence, failsafe, Remote ID, watchdog, or safety interlock
- writing to relay, lock, alarm, or actuator without approval

### 5. Simulation Evidence

For robots and drones, require machine-readable evidence before real actuation:

```json
{
  "schemaVersion": "clawguard.simEvidence.v1",
  "simulator": "gazebo",
  "scenario": "indoor-navigation-no-contact",
  "result": "pass",
  "collisions": 0,
  "maxSpeedMps": 0.3,
  "emergencyStopTested": true,
  "manualOverrideTested": true,
  "timestamp": "2026-05-12T00:00:00Z"
}
```

## Recommended Build Order

1. Add docs and examples first. Done.
2. Add device action classifier with safe default blocks. Done.
3. Add device skill manifest schema. Done.
4. Add `device plan` CLI in dry-run mode only. Done.
5. Add SOP Pack: `physical-devices/security-camera/privacy-review`.
6. Add SOP Pack: `physical-devices/talking-robot-toy/child-safe-interaction`.
7. Add SOP Pack: `physical-devices/drone/sitl-preflight`.
8. Add optional integrations for Home Assistant, Frigate, ROS 2, and PX4 SITL only.
9. Only after simulation and tester feedback, consider controlled lab hardware examples.

## Public Positioning

Use this language:

```text
ClawGuard helps govern AI agents that propose actions involving cameras, robots, drones, and embedded devices. It is a policy and evidence gate for planning, simulation, approval, and audit. It is not a flight controller, robot controller, or surveillance platform.
```

Avoid this language until mature partner testing exists:

```text
fully autonomous physical robot control
bank/enterprise/industrial certified
safe drone autopilot
camera hacking or surveillance automation
child-safe toy guarantee
```

## Best First Demo

The strongest safe demo is not a real drone. It is:

```text
AI proposes a drone mission
  -> ClawGuard detects drone-takeoff/offboard action
  -> requires SITL simulation, geofence, Remote ID/compliance note, failsafe, pilot approval
  -> blocks because evidence is missing
  -> allows only a draft mission checklist
```

Second-best demo:

```text
AI proposes a security-camera automation
  -> ClawGuard allows local person/package detection
  -> blocks external video upload and facial recognition without approval
  -> requires retention policy and privacy review
```

Third-best demo:

```text
AI proposes a talking robot toy behavior
  -> ClawGuard checks child-safe interaction SOP
  -> requires local audio processing and parent approval
  -> blocks hidden recording and unsafe servo motion
```
