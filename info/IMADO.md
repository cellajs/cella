# Imado


## Set cors headers
Create a JSON like this
```
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"], // Optionally add your full https:// domains here
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "HEAD", "POST", "PUT", "DELETE"],
      "MaxAgeSeconds": 3000,
      "ExposeHeaders": ["Etag"]
    }
  ]
}
```

```
aws s3api put-bucket-cors --bucket imado-dev-priv --cors-configuration file://cors.json --endpoint-url https://s3.nl-ams.scw.cloud
```
