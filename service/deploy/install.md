# Installing snapdropd on Computer B (Ubuntu)

1. Build the static binary (on any machine with Go 1.22+, or directly on
   Computer B):

   ```bash
   cd service
   make build
   ```

   This produces `service/bin/snapdropd`, a single static binary with no
   runtime dependencies.

2. Copy it to Computer B and install it:

   ```bash
   sudo install -m 0755 bin/snapdropd /usr/local/bin/snapdropd
   ```

3. Generate a shared token:

   ```bash
   snapdropd -gen-token
   ```

   Copy the printed value — you'll paste it into both the env file below
   and the extension's destination settings (Options page).

4. Create the config and screenshots directories:

   ```bash
   sudo mkdir -p /etc/snapdrop
   mkdir -p /home/hcadmin/screenshots
   ```

5. Create `/etc/snapdrop/snapdrop.env` from the example, filling in the
   token from step 3:

   ```bash
   sudo cp deploy/snapdrop.env.example /etc/snapdrop/snapdrop.env
   sudo chmod 600 /etc/snapdrop/snapdrop.env
   sudo $EDITOR /etc/snapdrop/snapdrop.env
   ```

6. Install and start the systemd unit:

   ```bash
   sudo cp deploy/snapdropd.service /etc/systemd/system/snapdropd.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now snapdropd
   ```

7. Verify locally on Computer B:

   ```bash
   sudo systemctl status snapdropd
   curl http://127.0.0.1:9922/healthz
   ```

   Expected: unit shows `active (running)`; curl returns
   `{"status":"ok","version":"0.1.0"}`.

8. Verify from Computer A over the LAN:

   ```bash
   curl http://<computer-b-lan-ip>:9922/healthz
   ```

   If this fails, check that Computer B's firewall (e.g. `ufw`) allows the
   configured port on the LAN interface.

9. In the extension's Options page, add a destination with this machine's
   name, `http://<computer-b-lan-ip>:9922` as the service address, and the
   token from step 3.
