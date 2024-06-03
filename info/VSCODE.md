# VSCode

## Workspace settings

- Create a folder named `.vscode` in your project directory if it doesn't exist already.
- Inside the `.vscode` folder, create a file named tasks.json.
- Paste the following configuration inside `settings.json`:

```json
{
  // Enable Tailwind CSS Intellisense for class attributes and variable declarations ending in `Styles`
  // E.g.,: const fooStyles = 'bg-red-500 text-white';
  "tailwindCSS.classAttributes": ["class", "className", ".*Styles"],

  "editor.formatOnSave": true,

  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "biomejs.biome"
  }
}
```

## Tasks

To enable automatic Docker startup and open two additional terminals when you launch VS Code, follow these steps:

- Create a folder named `.vscode` in your project directory if it doesn't exist already.
- Inside the `.vscode` folder, create a file named tasks.json.
- Paste the following configuration inside `tasks.json`:

```
{
  "version": "2.0.0",
  "tasks": [
    {
      // Label for the terminal and The command
      "label": "Start Docker",
      "type": "shell",
      // Command that run
      "command": "pnpm docker", // If u want initiate whole proccess add '&& pnpm generate && pnpm migrate && pnpm electrify'
      "group": "build",
      "isBackground": true,
      "presentation": {
        // Dedicated panel only for run Docker
        "panel": "dedicated"
      },
      // Run on open folder
      "runOptions": { "runOn": "folderOpen" }
    },
    //Open and empty terminal
    {
      "label": "First Terminal",
      "type": "shell",
      "command": "",
      "options": {
        "shell": {
          "executable": "pwsh.exe"
        }
      },
      "group": "build",
      "isBackground": true,
      "runOptions": { "runOn": "folderOpen" }
    },
    //Open and empty terminal
    {
      "label": "Second Terminal",
      "type": "shell",
      "command": "",
      "options": {
        "shell": {
          "executable": "pwsh.exe"
        }
      },
      "group": "build",
      "isBackground": true,
      "runOptions": { "runOn": "folderOpen" }
    }
  ]
}
```

Now, every time you open your project in VS Code, Docker will start automatically, and you'll have two additional terminals ready for your tasks.
