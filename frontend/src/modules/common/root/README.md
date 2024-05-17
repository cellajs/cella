For working with ElectricSQL you need to up docker containers.

Then you need to run the following command to up the docker containers:

```bash
pnpm docker:electric
```

After that, you need to prepare the frontend to work with ElectricSQL by running the following command:

```bash
pnpm prepare:electric:dev
```

And then you can run the frontend:

```bash
pnpm dev
```