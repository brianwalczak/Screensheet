<h1 align="center">Screensheet - The local remote desktop.</h1>
<p align="center">A Node.js application that allows you to use your device from anywhere with remote desktop, powered by WebRTC, Socket.IO, and Electron.</p>

> [!WARNING]
> **This project is currently in its beta state as I gather user feedback. If you encounter any issues, please report them <a href='https://github.com/BrianWalczak/Screensheet/issues'>here</a> :)**

## Features
- (🖥️) Instantly share your desktop remotely with a secure, 8-digit connection code.
- (🔐) Unattended access support with secure user/password authentication (hashed with bcrypt.js).
- (⚡) No account or signup required - start a session in seconds, right on your network.
- (🌐) Web-based viewer for easy access from any device, powered by WebRTC/WebSockets.
- (📶) Multi-protocol support allows you to switch between WebRTC and WebSockets effortlessly.
- (⌨️) Real-time keyboard and mouse input forwarding that can be enabled or disabled.
- (🔊) Optional device audio sharing that can be enabled or disabled.
- (👥) View, accept, decline, and disconnect visitors with ease.
- (🍁) Autumn is finally here, featuring a fall-themed user interface!
- (📦) Built with Node.js and Electron for cross-platform support.
- (👤) Open-source under Apache 2.0 license - contribute or view it anytime.

## What's new? (v1.3.0)
- Support for unattended access with username/password authentication
- Updated magic theme to feature a new autumn theme!
- Major fixes and improvements for error handling
- Fixed permissions and cross-platform testing on Windows, macOS, and Linux
- Major input handling improvements, including mobile support with touchscreens
- Removed “Automatic” option from protocol dropdown (WebRTC is default)
- Included tooltips in settings with recommendations
- Better formatting/naming system for IP addresses in connections list
- Added logo for application and favicon for website

## Demonstration

### Creating a Session
https://github.com/user-attachments/assets/37a4ada9-67e2-4964-ac90-3d86231351c7

### Viewing a Session
https://github.com/user-attachments/assets/40f3a9fd-9f43-44d6-aa8c-9d586e276eab

### Autumn Mode 🍁
https://github.com/user-attachments/assets/22e16e52-9bf9-467a-b17b-aa15dea5bf9a


## Getting Started
> [!TIP]
> If you're not planning to use Screensheet for development, you can download the pre-bundled executable on the [releases](https://github.com/brianwalczak/Screensheet/releases/latest) page.

To start, you can download this repository by using the following:
```bash
git clone https://github.com/BrianWalczak/Screensheet.git
cd Screensheet
```

Before you continue, make sure that Node.js is properly installed (run `node --version` to check if it exists). If you don't have it installed yet, you can download it [here](https://nodejs.org/en/download).

Next, install the required dependencies and start the server (port 3000):
```bash
npm install
npm run start
```

## Contributions

If you'd like to contribute to this project, please create a pull request [here](https://github.com/BrianWalczak/Screensheet/pulls). You can submit your feedback or any bugs that you find on the <a href='https://github.com/BrianWalczak/Screensheet/issues'>issues page</a>. Contributions are highly appreciated and will help us keep this project up-to-date!
