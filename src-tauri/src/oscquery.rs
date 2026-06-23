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
                    // Get IP address
                    let ip = info.get_addresses()
                        .iter()
                        .next()
                        .map(|ip| ip.to_string())
                        .unwrap_or_else(|| "127.0.0.1".to_string());
                    let port = info.get_port();
                    
                    // Query HOST_INFO from the HTTP server
                    let url = format!("http://{}:{}/?HOST_INFO", ip, port);
                    let client = reqwest::Client::builder()
                        .timeout(Duration::from_secs(1))
                        .build()
                        .map_err(|e| e.to_string())?;
                        
                    if let Ok(resp) = client.get(&url).send().await {
                        if let Ok(json) = resp.json::<serde_json::Value>().await {
                            // Extract OSC port (could be "OSC_PORT" or "oscPort" or "osc_port")
                            let osc_port = json.get("OSC_PORT")
                                .or_else(|| json.get("oscPort"))
                                .or_else(|| json.get("osc_port"))
                                .and_then(|v| v.as_u64());
                                
                            if let Some(p) = osc_port {
                                let osc_ip = json.get("OSC_IP")
                                    .or_else(|| json.get("oscIP"))
                                    .or_else(|| json.get("osc_ip"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| ip.clone());
                                    
                                return Ok(Some(OscQueryService {
                                    name: service_name,
                                    osc_ip,
                                    osc_port: p as u16,
                                }));
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
