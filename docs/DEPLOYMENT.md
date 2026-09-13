# Google Cloud deployment: retrofitpathfinder

No resources have been provisioned by this build. Run these steps in an authenticated Google Cloud Shell after reviewing the billable resources and the project's available credits. Project access and an OpenAI API key were not present on the build workstation.

## Intended services

- Cloud Run app and two daily Cloud Run jobs, `europe-west1`.
- Cloud SQL PostgreSQL 17 with the `vector` extension.
- Artifact Registry for the container.
- Secret Manager for the OpenAI and database credentials.
- Cloud Scheduler invokes source-refresh and retention jobs with OAuth service-account identity.

## Provision once

Upload/clone the repository into Cloud Shell. Confirm that the selected project is **retrofitpathfinder**. The commands below create billable resources. Use an organisation-approved Cloud SQL size and availability setting; the following is a small pilot instance, not a highly available production service.

```bash
gcloud config set project retrofitpathfinder
gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com cloudscheduler.googleapis.com
gcloud artifacts repositories create retrofit --repository-format=docker --location=europe-west1
gcloud iam service-accounts create retrofit-runtime --display-name='Retrofit application runtime'
gcloud iam service-accounts create retrofit-scheduler --display-name='Retrofit scheduled jobs'
gcloud projects add-iam-policy-binding retrofitpathfinder --member=serviceAccount:retrofit-runtime@retrofitpathfinder.iam.gserviceaccount.com --role=roles/cloudsql.client
gcloud sql instances create retrofit-db --database-version=POSTGRES_17 --edition=ENTERPRISE --tier=db-custom-1-3840 --region=europe-west1 --storage-size=10 --storage-type=SSD --backup-start-time=02:00 --enable-point-in-time-recovery
gcloud sql databases create retrofit --instance=retrofit-db
```

Set a unique strong `postgres` administrator password using the Cloud SQL console. Using SQL Studio or `gcloud sql connect retrofit-db --user=postgres --database=retrofit`, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE USER retrofit_app WITH PASSWORD 'ENTER_A_UNIQUE_STRONG_PASSWORD_HERE';
GRANT CONNECT ON DATABASE retrofit TO retrofit_app;
GRANT USAGE, CREATE ON SCHEMA public TO retrofit_app;
```

Do not save this SQL with a real password in the repository or shell history. Prefer the console's user creation flow for the password, followed by the non-secret GRANT statements. The application account owns its own tables and runs the MVP schema bootstrap; it does not need superuser access once `vector` exists.

Create secrets and add values through Secret Manager's console (avoids credentials in terminal arguments):

```bash
gcloud secrets create retrofit-openai-key --replication-policy=user-managed --locations=europe-west1
gcloud secrets create retrofit-db-password --replication-policy=user-managed --locations=europe-west1
for SECRET in retrofit-openai-key retrofit-db-password; do
  gcloud secrets add-iam-policy-binding "$SECRET" --member=serviceAccount:retrofit-runtime@retrofitpathfinder.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
done
```

Put the OpenAI key in the first secret and the `retrofit_app` database password in the second. Review the Cloud Build execution service account permissions in your organisation: it needs Artifact Registry write access and logging, while your deployment identity needs Cloud Run administration and permission to act as the two service accounts. Do not grant broad Owner to the runtime.

## Deploy app and daily jobs

```bash
bash deploy/deploy.sh
```

The app initially uses a deliberately unusable placeholder origin; the script replaces it with the actual HTTPS Cloud Run URL immediately after deployment. This prevents sign-in through an unconfigured origin. If using a custom domain, update `APP_ORIGIN` to that exact HTTPS origin before inviting users.

The source and retention jobs use the same image, persistent database and runtime identity. The scheduler only has invocation rights on those jobs. Secrets are not placed in scheduler URLs. Check your organisation permits an authenticated Cloud SQL connection via Unix socket and public Cloud Run ingress; adapt to private networking if required.

## Bootstrap the administrator

Use a one-off Cloud Run job based on the deployed image, command `node`, arguments `server/bootstrap.js`. Give it the same database connection, runtime service account and database-password secret as the app. Supply `BOOTSTRAP_ADMIN_EMAIL` as an environment variable and `BOOTSTRAP_ADMIN_PASSWORD` as a separate Secret Manager secret with at least 16 characters. Only the bootstrap job needs that secret. Run it once, verify the administrator can sign in, and delete the bootstrap job/secret version when no longer needed. The bootstrap refuses to run if any admin exists.

The app can now invite homeowners and advisers. It returns a single-use invitation link; it does not send email. Use a secure channel agreed with the recipient.

## Required smoke checks before onboarding

1. Check `/api/health`. Sign in as the administrator; verify demo endpoints are absent.
2. Invite two disposable test homeowners and one adviser. Verify account isolation, assignment and revocation, including direct PDF links.
3. Run the source job. **SEAI returned 403 from the build workstation**. Verify access from the Cloud Run egress network. If refused there too, obtain an authorised retrieval/feed arrangement; do not bypass access controls. Until then, treat the evidence as dated manual summaries.
4. Confirm real source rows, dates, embedded chunk counts and pgvector retrieval. Review the grant catalogue before clearing a changed-source flag.
5. Enable AI for a synthetic profile and send a question. Check the model is available to the OpenAI project; verify grounded citations and confirm changes before saving.
6. Generate a PDF, restart the service and reopen the same immutable PDF. Create another version and verify the earlier one remains available.
7. Run deletion and retention on disposable test homes. Verify records and PDFs disappear and audit metadata persists.
8. Check Cloud Scheduler run history and create alerts for failed Cloud Run jobs. Configure API quotas, billing budgets, backups, authorised operators and the restore/deletion replay process.

## Rollback

Keep the previous container digest and Cloud Run revision. Shift traffic back with the console if needed. Database schema is currently additive and backward compatible. Do not restore an old database snapshot into service without replaying deletion requests and reviewing retention, because that can restore erased personal data.
