For working with ElectricSQL you need to up docker container with name `electric`.

Firstly, you need to set up the environment variables in the `.env.electric` file. You can use the `.env.electric.example` file as an example.

Then you need to run the following command to up the docker container:

```bash
docker-compose up electric
```

After that, you need to run migrations:

```bash
pnpm migrate:fe
```

And then you can run the frontend:

```bash
pnpm dev
```