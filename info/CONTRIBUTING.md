# Contributing

## Coding conventions
Its all about code that is easy to read. Start reading our code to make yourself familiar quickly. For a good developer experience, its useful to have consistency in code style and conventions/practices. Some of that is automated. This list is by no means complete but the idea is to add new tips and conventions along the way.

**Our DX motto is 3R: Readability, Reliability and Reusability.**

  * We indent using two spaces (soft tabs)
  * Programming case types: `kebab-case` for file names, `PascalCase` for component names and classes, `camelCase` for everything else.
  * We try to reduce lines of code while retaining readability. Too many lines reduce readability too. If it fits nicely on one line, please do so.
  * We avoid too much nesting in `jsx`. It becomes unreadable. Split code in multiple chunks in same file.
  * We ALWAYS put spaces after list items and method parameters (`[1, 2, 3]`, not `[1,2,3]`), around operators (`x += 1`, not `x+=1`), and around hash arrows.
  * When making a frontend component, consider if it will be a dumb/composable component or a smart component. A dumb component focuses on UI and can be reused in different contexts without editing any lines on the component itself. A smart components handles context specific business logic and can only reused in the same context every time. When trying to make a dumb/composable component, try to consider how it could be used in an entirely different app too, this will likely improve reusability. 
  * We prefer to use SVGs, mainly because you can apply CSS. Import them to keep the code cleaner.
  * Only add variables in ENV if they are a security threat or need to be different for each developer on their local machine. If thats not the case, just make it an app config variable in `/config` folder. ENV vars should only be used - if possible - in the `/config` folder to have a good overview of all app related config from one location.
  * We use `id` everywhere as unique identifier. However its possible for first class data objects - such as `users` and `organizations` to identify them by `slug` too. This is useful when loading a profile page when you only a slug in the URL as identifier. There must not be a duplicate slug in the entire database.


## Miscellaneous

### SVG
SVGs can be messy business. Here are some tools: 
* <https://jakearchibald.github.io/svgomg/>

### Icons
You can generate icons here
* <https://favicon.io/favicon-converter/>
