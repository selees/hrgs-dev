# HRGS (Heart Rate Game System) Development Log

## 날짜: 2026년 6월 9일 ~ 6월 15일 (v0.7.0 릴리즈)

## 완료된 작업 및 수정 사항

1. **블루투스 연결 로직 최적화 및 UI 멈춤 현상 수정**
   - **문제:** 앱을 시작할 때 백그라운드에서 `reconnectWithConfig`가 완료될 때까지 `await`로 대기하면서 UI(로딩)가 멈춰있어, 기기를 스캔하지 못하면 설정 창으로 진입할 수 없는 버그가 있었습니다.
   - **해결:** `loadConfig`에서 연결 시도 시 `await`를 제거하여 백그라운드에서 비동기적으로 실행되게 수정했습니다. 또한, 컴포넌트 마운트 상태(`isMounted` ref)를 추가하여 설정창에 들어가 메인 화면 UI가 언마운트되면 불필요한 블루투스 무한 스캔 루프가 정상적으로 중단되도록 조치했습니다.

2. **블루투스 연결 끊김 감지 및 UI 복구 처리**
   - **문제:** 정상적으로 작동하다가 블루투스 기기와의 연결이 중간에 끊겼을 때(배터리 방전 등), 앱이 이를 인식하지 못해 UI에서는 여전히 연결된 것처럼 보였습니다.
   - **해결:** Rust 백엔드의 통신 스트림이 끊어졌을 때 `bluetooth_disconnected` 이벤트를 즉시 발생시키도록 수정했습니다. 프론트엔드(`BluetoothManager`)는 이 이벤트를 감지하고 내부 연결 상태를 해제하여, 사용자가 UI에서 붉은색 연결 끊김 표시를 확인하고 다시 연결을 시도할 수 있도록 개선했습니다.

3. **위젯 모드 기능 통합 (Pulsoid & HypeRate)**
   - **문제:** 기존 `widget` (Pulsoid) 외에 `hyperate` 모드를 추가하려 했으나, 구조상 분리할 필요성이 떨어졌습니다.
   - **해결:** 설정에 HypeRate 모드를 별도로 두는 대신 **"Widget" 모드 하나로 완전히 통합**했습니다.
   - 설정에 `widget_id`를 입력하면 앱이 아이디의 길이와 형태(7자리 내외 vs UUID)를 자동으로 파악해 HypeRate 웹소켓이나 Pulsoid 웹소켓으로 알아서 연결합니다.
   - 관련되어 연결 시 각 웹소켓 매니저를 생성/폐기하는 로직을 효율적으로 구성하여, 쓰지 않는 모듈이 메모리에 남는 현상(캐싱 오류)을 최적화했습니다.

4. **OSC 네트워크 연결 관련 OS 에러 (10047) 수정**
   - **문제:** `127.0.0.1`이나 `localhost` 등의 로컬 IP가 IPv6(`::1`)로 해석될 때, 항상 IPv4 소켓(`0.0.0.0`)만 생성하여 데이터를 전송하려다가 `os error 10047`이 발생했습니다.
   - **해결:** 주소 해석(Resolve) 후 대상의 IP가 IPv4인지 IPv6인지 확인하여 그에 맞는 소켓(각각 `0.0.0.0:0`, `[::]:0`)을 생성하여 통신하도록 Rust 백엔드를 수정했습니다.

5. **Tauri v2 보안 설정(`fetch_cancel_body`)으로 인한 Pulsoid 연결 오류 해결**
   - **문제:** Tauri 2 버전의 엄격한 보안 권한 설정 탓에 프론트엔드에서 `fetch`로 Pulsoid 토큰을 가져올 때 에러가 발생했습니다.
   - **해결:** 프론트엔드의 `fetch` 대신, 권한 문제 없이 작동하는 기존 Rust 백엔드의 `get_websocket_url` 커맨드를 호출(Invoke)하도록 변경하여 안전하게 주소를 받아오도록 수정했습니다. 동시에 Rust 측의 JSON 파싱(camelCase 매핑) 버그(`ramiel_url` / `ramielUrl`)도 해결했습니다.

6. **MIDI 포트 연결 최적화 및 유연성 확보**
   - **문제:** 설정에 기입된 MIDI 포트 이름과 윈도우 OS의 실제 포트 이름이 대소문자나 띄어쓰기까지 100% 일치해야만 연결되었습니다.
   - **해결:** `midi.rs`에서 포트 이름을 대소문자 구분 없이, 그리고 일부만 입력해도 포함(contains)되어 있으면 자동으로 찾아서 연결하도록 수정했습니다. 만약 포트를 못 찾을 경우, 에러 메시지에 현재 인식 가능한 모든 포트 목록을 보여주도록 편의성을 더했습니다.

7. **loopMIDI 가상 포트 인식 및 데이터 전송 완료 (해결)**
   - **문제:** 앱이 OS 상의 가상 MIDI 포트(`hroscmidi` 등)를 인식하지 못하여 MIDI 심박수 전송이 불가능했던 현상이 있었습니다.
   - **해결:** loopMIDI 가상 포트 설정 및 프로세스 재시작을 통해 OS 상에서 가상 포트 인식을 확인했으며, 앱에서 정상적으로 심박수 관련 MIDI 데이터를 검출 및 전송하는 것을 완료했습니다.

8. **설정 UI 레이아웃 개선**
   - **문제:** 설정창에서 나가기 위한 닫기 버튼이 오른쪽 위에 `X`로 되어 있어 조작 직관성이 낮고, 소셜 링크 위치가 좌측 타이틀 영역에 섞여 있었습니다.
   - **해결:** 기존의 `X` 버튼을 제거하고 "Settings" 텍스트 왼쪽에 뒤로가기 화살표 아이콘(`ChevronLeft`)을 배치하여 뒤로가기 흐름을 자연스럽게 만들었습니다. 또한, 깃허브 및 트위터 링크 버튼을 헤더의 맨 우측으로 옮겨 깔끔하게 구성했습니다.

## 빌드 정보
- **바이너리 위치:** `D:\hrgs-dev\hrgs-dev\src-tauri\target\release` (hrgs.exe)
- **버전:** v0.7.0

---

# HRGS (Heart Rate Game System) Development Log

## Date: June 9, 2026 ~ June 15, 2026 (v0.7.0 Release)

## Completed Tasks & Bug Fixes

1. **Bluetooth Connection Logic Optimization & UI Freeze Fix**
   - **Issue:** On startup, the UI would freeze/lock on the loading screen because it awaited `reconnectWithConfig` synchronously in the background. If the device scan failed or timed out, the user could not enter the Settings panel.
   - **Resolution:** Removed the `await` from the connection attempt in `loadConfig` to let it execute asynchronously in the background. Additionally, introduced a component mount tracker (`isMounted` ref) to stop the infinite background Bluetooth scanning loop when the main UI unmounts (e.g., when transitioning to the Settings page).

2. **Bluetooth Disconnection Detection & UI State Recovery**
   - **Issue:** When a Bluetooth device disconnected mid-session (e.g., battery depletion), the app failed to detect it, leaving the UI showing the device as still connected.
   - **Resolution:** Modified the Rust backend to immediately emit a `bluetooth_disconnected` event when the communication stream closes. The frontend (`BluetoothManager`) listens for this event to clear the active connection state and display a red disconnected indicator, allowing users to reconnect immediately.

3. **Unified Widget Mode (Pulsoid & HypeRate)**
   - **Issue:** Attempting to split the configurations for the original `widget` (Pulsoid) and a new `hyperate` mode proved structurally redundant and added complexity.
   - **Resolution:** Completely consolidated both under a single **"Widget" Mode**.
   - The app now automatically detects the length and format of the user-provided `widget_id` (e.g., ~7 characters vs. a full UUID) to decide whether to connect to the HypeRate or Pulsoid websocket API.
   - Optimized connection/disposal logic for each websocket manager to prevent memory leaks and cache errors.

4. **OSC Connection OS Error (10047) Fix**
   - **Issue:** When local IP addresses like `127.0.0.1` or `localhost` resolved to IPv6 (`::1`), the app still created a standard IPv4 socket (`0.0.0.0`), leading to `os error 10047`.
   - **Resolution:** Updated the Rust backend to inspect the resolved address family (IPv4 vs. IPv6) and dynamically bind to the correct local address (`0.0.0.0:0` for IPv4, `[::]:0` for IPv6) before establishing communication.

5. **Pulsoid Connection Issue due to Tauri v2 Security Policies**
   - **Issue:** Tauri v2's strict origin security policies blocked the frontend from making direct `fetch` calls to retrieve the Pulsoid WebSocket URL.
   - **Resolution:** Switched from a frontend `fetch` request to invoking a secure Rust backend command (`get_websocket_url`). Also resolved a JSON parsing/deserialization mismatch between camelCase (`ramielUrl`) and snake_case (`ramiel_url`).

6. **Flexible MIDI Port Connection**
   - **Issue:** The configuration required a strict 100% exact match (including casing and spacing) with the Windows OS MIDI port names to establish a connection.
   - **Resolution:** Modified `midi.rs` to find ports case-insensitively and through partial matching (using `contains`). If the target port is not found, the error response now lists all active MIDI ports available on the system.

7. **loopMIDI Virtual Port Recognition & Data Transmission (Resolved)**
   - **Issue:** The app originally failed to recognize virtual MIDI ports created by loopMIDI (such as `hroscmidi`), preventing MIDI heart rate data transmission.
   - **Resolution:** By configuring loopMIDI virtual ports and restarting the process, the virtual ports are now properly detected by the OS and the app. Verified that heart rate MIDI note and CC data are correctly transmitted.

8. **Settings UI Layout Improvements**
   - **Issue:** The close button in the settings panel was positioned as an `X` on the top-right, which felt disconnected from the navigation flow, and social links were cluttered near the title.
   - **Resolution:** Replaced the `X` button with a standard back arrow (`ChevronLeft`) positioned to the left of the "Settings" title. Moved the GitHub and Twitter link buttons to the far-right of the header for a cleaner, modern layout.

## Build Information
- **Executable Path:** `D:\hrgs-dev\hrgs-dev\src-tauri\target\release` (hrgs.exe)
- **Version:** v0.7.0