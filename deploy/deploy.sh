#!/usr/bin/env bash
# Run from this repository in Google Cloud Shell AFTER docs/DEPLOYMENT.md provisioning.
# This deploys billable resources. Read the deployment guide first.
set -euo pipefail
PROJECT_ID=retrofitpathfinder
REGION=europe-west1
SERVICE=retrofit-pathfinder
RUNTIME_SA="retrofit-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SA="retrofit-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
INSTANCE="${PROJECT_ID}:${REGION}:retrofit-db"
gcloud config set project "$PROJECT_ID"
BUILD_ID=$(gcloud builds submit --config=deploy/cloudbuild.yaml --format='value(id)' --quiet)
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/retrofit/app:${BUILD_ID}"
# An HTTPS placeholder origin intentionally prevents login until corrected below.
gcloud run deploy "$SERVICE" --image="$IMAGE" --region="$REGION" \
  --service-account="$RUNTIME_SA" --add-cloudsql-instances="$INSTANCE" \
  --env-vars-file=deploy/runtime-env.yaml \
  --set-secrets=OPENAI_API_KEY=retrofit-openai-key:latest,PGPASSWORD=retrofit-db-password:latest \
  --memory=512Mi --cpu=1 --max-instances=3 --min-instances=0 --concurrency=30 \
  --timeout=900 --allow-unauthenticated --quiet
SERVICE_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
gcloud run services update "$SERVICE" --region="$REGION" --update-env-vars="APP_ORIGIN=${SERVICE_URL}" --quiet
for JOB in sources retention; do
  gcloud run jobs deploy "retrofit-${JOB}" --image="$IMAGE" --region="$REGION" \
    --service-account="$RUNTIME_SA" --set-cloudsql-instances="$INSTANCE" \
    --env-vars-file=deploy/runtime-env.yaml \
    --set-secrets=OPENAI_API_KEY=retrofit-openai-key:latest,PGPASSWORD=retrofit-db-password:latest \
    --command=node --args="server/jobs.js,${JOB}" --memory=512Mi --cpu=1 --tasks=1 --max-retries=1 --task-timeout=1200s --quiet
  gcloud run jobs add-iam-policy-binding "retrofit-${JOB}" --region="$REGION" \
    --member="serviceAccount:${SCHEDULER_SA}" --role=roles/run.invoker --quiet
  if gcloud scheduler jobs describe "retrofit-${JOB}" --location="$REGION" >/dev/null 2>&1; then
    MODE=update
  else
    MODE=create
  fi
  # 04:10 UTC source refresh, 04:40 UTC retention. No secret tokens in scheduler URLs.
  SCHEDULE='10 4 * * *'
  if [ "$JOB" = retention ]; then SCHEDULE='40 4 * * *'; fi
  gcloud scheduler jobs "$MODE" http "retrofit-${JOB}" --location="$REGION" \
    --schedule="$SCHEDULE" --time-zone=UTC --http-method=POST \
    --uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/retrofit-${JOB}:run" \
    --oauth-service-account-email="$SCHEDULER_SA" --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform --quiet
done
printf '\nDeployed app: %s\n' "$SERVICE_URL"
printf 'Create the first administrator using the bootstrap job described in docs/DEPLOYMENT.md.\n'
