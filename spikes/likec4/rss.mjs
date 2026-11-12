process.on('exit', () => console.error(JSON.stringify({ peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024), uptimeMs: Math.round(process.uptime() * 1000) })))
