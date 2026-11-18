use std::sync::OnceLock;
use std::time::Duration;

static SHARED_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static SHARED_STREAMING_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn build_base_client(total_timeout: Option<Duration>) -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(8)
        .tcp_keepalive(Duration::from_secs(60));
    if let Some(timeout) = total_timeout {
        builder = builder.timeout(timeout);
    }
    builder.build().expect("shared reqwest client should build")
}

pub fn shared_client() -> &'static reqwest::Client {
    SHARED_CLIENT.get_or_init(|| build_base_client(Some(Duration::from_secs(30))))
}

/// Shared pooled client without a total request timeout, safe for long-lived SSE streams.
pub fn shared_streaming_client() -> &'static reqwest::Client {
    SHARED_STREAMING_CLIENT.get_or_init(|| build_base_client(None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    async fn spawn_keepalive_ok_server() -> std::net::SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind loopback");
        let addr = listener.local_addr().expect("local addr");
        tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                tokio::spawn(async move {
                    let mut buf = [0_u8; 1024];
                    loop {
                        match stream.read(&mut buf).await {
                            Ok(0) | Err(_) => break,
                            Ok(_) => {
                                let resp = b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: keep-alive\r\n\r\nok";
                                if stream.write_all(resp).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                });
            }
        });
        addr
    }

    fn median(samples: &mut [f64]) -> f64 {
        samples.sort_by(|a, b| a.total_cmp(b));
        samples[samples.len() / 2]
    }

    #[test]
    fn shared_client_returns_singleton_instance() {
        assert!(std::ptr::eq(shared_client(), shared_client()));
        assert!(std::ptr::eq(
            shared_streaming_client(),
            shared_streaming_client()
        ));
        assert!(!std::ptr::eq(shared_client(), shared_streaming_client()));
    }

    #[tokio::test]
    async fn shared_client_outperforms_per_call_client_creation() {
        let addr = spawn_keepalive_ok_server().await;
        let url = format!("http://{addr}/");
        const REQUESTS_PER_BATCH: usize = 20;

        // Prime shared client once so steady-state request reuse is measured fairly.
        let warmup = shared_client().get(&url).send().await.expect("warmup");
        assert_eq!(warmup.status(), reqwest::StatusCode::OK);

        let mut per_call_runs = Vec::with_capacity(3);
        let mut shared_runs = Vec::with_capacity(3);

        for _ in 0..3 {
            let start = Instant::now();
            for _ in 0..REQUESTS_PER_BATCH {
                let client = reqwest::Client::new();
                let res = client.get(&url).send().await.expect("per-call get");
                assert_eq!(res.status(), reqwest::StatusCode::OK);
                let _ = res.text().await.expect("per-call body");
            }
            per_call_runs.push(start.elapsed().as_secs_f64() * 1000.0);

            let start = Instant::now();
            for _ in 0..REQUESTS_PER_BATCH {
                let res = shared_client().get(&url).send().await.expect("shared get");
                assert_eq!(res.status(), reqwest::StatusCode::OK);
                let _ = res.text().await.expect("shared body");
            }
            shared_runs.push(start.elapsed().as_secs_f64() * 1000.0);
        }

        let per_call_median = median(&mut per_call_runs.clone());
        let shared_median = median(&mut shared_runs.clone());
        println!(
            "http_client_bench per_call_ms={per_call_runs:?} median={per_call_median:.3}ms shared_ms={shared_runs:?} median={shared_median:.3}ms"
        );
        assert!(shared_median <= per_call_median);
    }
}
