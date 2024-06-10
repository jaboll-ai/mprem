# An mpremote based command system

### Intended use for micro controllers

Works like a charm with ESP-32-WroOM

It can show you all the connected ports and devices

![Show device list](resources/devices.png)

It runs active files on the micro-controller, syncs data back and forth, 
clears the micro-controller and more...
![Show command list](resources/commands.png)

### Stubbing
- execute `mprem: Install micropython stubber` to install the necessary stubs for linting
- then do `mprem: Set to custom micropython environment` to toggle between the custom python environment with the stubs installed


### FYI:
- All of this can be done with mpremote and esptool only
- For beginners: (https://thonny.org/)