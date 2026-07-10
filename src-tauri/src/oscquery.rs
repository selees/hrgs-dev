use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OscQueryService {
    pub name: String,
    pub osc_ip: String,
    pub osc_port: u16,
}

#[tauri::command]
pub async fn detect_vrchat_osc() -> Result<Option<OscQueryService>, String> {
    let mdns = ServiceDaemon::new().map_err(|e| format!("Failed to create mDNS daemon: {}", e))?;
    let receiver = mdns.browse("_oscjson._tcp.local.").map_err(|e| format!("Failed to browse _oscjson._tcp: {}", e))?;
    
    let start_time = Instant::now();
    let timeout = Duration::from_secs(3);
    
    while Instant::now() - start_time < timeout {
        // Try to receive an event with a short timeout to keep checking duration
        if let Ok(event) = receiver.recv_timeout(Duration::from_millis(100)) {
            match event {
                ServiceEvent::ServiceResolved(info) => {
                    let service_name = info.get_fullname().to_string();
                    let port = info.get_port();
                    
                    // Collect all resolved IP addresses as candidates
                    let mut ips_to_try: Vec<String> = info.get_addresses()
                        .iter()
                        .map(|ip| ip.to_string())
                        .collect();
                    
                    // On Windows, VRChat often binds only to 127.0.0.1, but mDNS advertises the LAN IP.
                    // Add 127.0.0.1 as a candidate if not already present.
                    if !ips_to_try.iter().any(|ip| ip == "127.0.0.1" || ip == "localhost" || ip == "::1") {
                        ips_to_try.push("127.0.0.1".to_string());
                    }

                    let client = reqwest::Client::builder()
                        .timeout(Duration::from_secs(1))
                        .build()
                        .map_err(|e| e.to_string())?;

                    for ip in &ips_to_try {
                        // Correctly wrap IPv6 addresses in square brackets
                        let formatted_ip = if ip.contains(':') {
                            format!("[{}]", ip)
                        } else {
                            ip.clone()
                        };

                        let url = format!("http://{}:{}/?HOST_INFO", formatted_ip, port);
                        
                        if let Ok(resp) = client.get(&url).send().await {
                            if let Ok(json) = resp.json::<serde_json::Value>().await {
                                // Double check if it is VRChat
                                let is_vrchat = service_name.to_lowercase().contains("vrchat")
                                    || json.get("NAME")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_lowercase().contains("vrchat"))
                                        .unwrap_or(false);

                                if !is_vrchat {
                                    continue; // Skip non-VRChat services (like XSOverlay)
                                }

                                // Extract OSC port (could be "OSC_PORT" or "oscPort" or "osc_port")
                                let osc_port = json.get("OSC_PORT")
                                    .or_else(|| json.get("oscPort"))
                                    .or_else(|| json.get("osc_port"))
                                    .and_then(|v| v.as_u64());
                                    
                                if let Some(p) = osc_port {
                                    let mut osc_ip = json.get("OSC_IP")
                                        .or_else(|| json.get("oscIP"))
                                        .or_else(|| json.get("osc_ip"))
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string())
                                        .unwrap_or_else(|| ip.clone());
                                    
                                    // If returned OSC_IP is local loopback/unspecified, but we connected via a LAN IP,
                                    // override it with the LAN IP so cross-device (Quest) works.
                                    if (osc_ip == "127.0.0.1" || osc_ip == "localhost" || osc_ip == "0.0.0.0" || osc_ip == "::1") 
                                        && ip != "127.0.0.1" && ip != "localhost" && ip != "::1" {
                                        osc_ip = ip.clone();
                                    }
                                        
                                    return Ok(Some(OscQueryService {
                                        name: service_name,
                                        osc_ip,
                                        osc_port: p as u16,
                                    }));
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
    
    Ok(None)
}
