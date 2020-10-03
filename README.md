# kMetrics

KDX Metrics Sandbox

# Setup 

Symlink `[KDX location]/apps/kmetrics` to this folder

# Introduction

kMetrics is a [KDX](https://github.com/aspectron/kdx) Applet is designed to do
a *very basic* profiling of Kaspa transaction capacity. This applet runs within
the KDX environment providing control of `txgen`, runs an HTTP poller to probe
kasparov for new blocks and offering the following performance readouts:

- TPS Average - 15 sec average
- TPS Last - 1 sec sample
- Block Queue - Number of blocks visible from Kasparov pending transaction fetch
- Blocks - current number of blocks (`/blocks/count`)
- Transactions - number of transactions seen since kMetrics started (helps visualize increase/decrease of tx rate)
- Fetch duration - duration of the last `/transactions/block` operation

Other metrics can easily be added.

kMetrics does not currently implement MQTT feed as it is designed to stress and measure performance
of Kasparov.