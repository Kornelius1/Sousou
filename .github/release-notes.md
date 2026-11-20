<h1 align="center">Lentera Worship v{{VERSION}}</h1>

<p align="center">
  Presentation software for song lyrics, Bible verses, and worship slides.<br>
  Free and open source.
</p>

<p align="center">
  <a href="https://github.com/Kornelius1/lentera-worship/releases/download/v{{VERSION}}/Lentera.Worship_{{VERSION}}_x64-setup.exe">
    <img src="https://raw.githubusercontent.com/Kornelius1/lentera-worship/main/docs/images/download-button-en.svg" alt="Download Lentera Worship for Windows" width="300">
  </a>
</p>

---

## ✨ What's new

- **Updated app icon.** The installer and app now use the refreshed icon.

## 📥 Install (Windows)

1. Click the button above, or pick a file from **Assets** below:
  - `Lentera.Worship_{{VERSION}}_x64-setup.exe` (recommended)
  - `Lentera.Worship_{{VERSION}}_x64_en-US.msi` (for managed deployment)
2. Run the installer. If you see a blue "Windows protected your PC" warning, click **More info**, then **Run anyway**.

> **Why the warning?** The app is not yet digitally signed (no paid certificate). It does not mean the file contains a virus. The full source code is available in this repository.

This installer includes the NDI® runtime (see the license page shown during installation).

## 🔐 Verify your download

{{CHECKSUMS}}

To check in PowerShell:

```powershell
Get-FileHash .\<file-name> -Algorithm SHA256
```

NDI® is a registered trademark of Vizrt NDI AB. [ndi.video](https://ndi.video/)