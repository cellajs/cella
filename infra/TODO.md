# Infra TODO

Tracked friction and follow-ups for the production infra stack.

## Image tags live only in S3 (resolved)

The earlier `pulumi up` papercut — a local apply failing with
`UnpinnedImageError` because the image tag wasn't committed — is gone. Image
tags left Pulumi entirely: the running version of each service lives solely in
`s3://<bucket>/deploy/<svc>.tag`, written by the `roll-services` job and read by
the on-VM reconciler. Consequences:

- A local `pulumi up` (rotating `dbPassword`, refreshing state, etc.) "just
  works" — there is no image tag to set, and cloud-init no longer changes per
  release, so VMs are not replaced by a routine apply.
- Immutability is enforced on the **write path**: the `roll-services` "Write
  deploy tag" step refuses to publish an empty or `:latest` SHA to S3, so a
  mutable tag can never reach the reconciler.
- Rollback is a tag rewrite only (CI republishes the previous SHA); there is no
  Pulumi-config escape hatch and no S3 versioning to race the reconciler.

## Related cleanup

- [ ] Post-rotation: confirm `git diff infra/Pulumi.production.yaml` shows only
      rotated `secure:` blobs and no `imageTag` line before committing.

- [ ] Post-rotation: confirm `git diff infra/Pulumi.production.yaml` shows only
      rotated `secure:` blobs and no `imageTag` line before committing.
