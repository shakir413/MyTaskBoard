# Taskboard: deploy a full-stack app on AWS, step by step

**Stack:** React (frontend) + Node.js/Express (backend) + PostgreSQL (database)

## The big picture

```
 Browser
    |
    v
 CloudFront  (the front door + delivery network, gives you HTTPS)
    |-- /*      --> S3 bucket   (React files: HTML, JS, CSS)
    |-- /api/*  --> EC2 server  (Nginx --> Node.js)
                        |
                        v
                   RDS PostgreSQL  (private, only EC2 can talk to it)
```

| AWS service | Job | Analogy |
|---|---|---|
| S3 | Stores the built React files | A warehouse of static files |
| CloudFront | HTTPS + one public address for everything | The building's main entrance and reception |
| EC2 | A Linux computer that runs Node.js | Your rented kitchen |
| Nginx | Receives web traffic and hands it to Node | Receptionist |
| PM2 | Keeps Node running, restarts on crash | A supervisor who never sleeps |
| RDS | Managed PostgreSQL | A vault with a bank manager (AWS handles backups and patches) |
| Security Groups | Firewall rules | Door locks with guest lists |

**Why one address for both frontend and backend?** CloudFront sends `/api/*` to EC2 and everything else to S3.
The browser sees one HTTPS site, so there is no CORS or mixed-content (HTTPS page calling HTTP API) problem.

---

## Phase 0: Prepare

- [ ] AWS account (add a payment method) and **do not use the root user**: create an IAM user with admin access for learning.
- [ ] Billing: Billing console > Budgets > create a monthly budget of e.g. $5 with an email alert.
- [ ] Pick **one region** (e.g. `ap-south-1` Mumbai) and use it for everything. Check the region at the top right of the console every time.
- [ ] Install: Node.js 20+, Git. Optional: Docker, AWS CLI.

## Phase 1: Run it on your computer first

Always make it work locally before the cloud. Otherwise you can't tell what is broken.

```bash
# 1. Database (needs Docker)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run dev          # http://localhost:5000/api/health

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

You should see "API and database connected" and be able to add, tick and delete tasks.
No Docker? Install PostgreSQL normally, create a database called `taskboard`, and put your credentials in `backend/.env`.

Push the project to a GitHub repository (the `.gitignore` already keeps secrets and `node_modules` out).

---

## Phase 2: Firewalls (Security Groups)

EC2 console > Network & Security > Security Groups > Create. Use the **default VPC**.

| Name | Inbound rule | Source |
|---|---|---|
| `taskboard-ec2-sg` | SSH, port 22 | My IP |
| `taskboard-ec2-sg` | HTTP, port 80 | Anywhere IPv4 (tighten later, see Phase 8) |
| `taskboard-rds-sg` | PostgreSQL, port 5432 | **Security group:** `taskboard-ec2-sg` |

The last rule is the key idea: the database accepts connections **only from your server**, not from the internet.

---

## Phase 3: Database (RDS PostgreSQL)

RDS console > Create database.

| Setting | Value |
|---|---|
| Creation method | Standard create |
| Engine | PostgreSQL |
| Template | **Free tier** (or Dev/Test) |
| DB instance identifier | `taskboard-db` |
| Master username | `postgres` |
| Master password | Choose a strong one and save it |
| Instance class | `db.t3.micro` (or `db.t4g.micro`) |
| Storage | 20 GB gp3, turn off storage autoscaling |
| Public access | **No** |
| VPC security group | `taskboard-rds-sg` |
| Additional configuration > Initial database name | `taskboard` |
| Backups | 1 day is enough for learning |

Wait until status is **Available** (5 to 10 minutes). Copy the **Endpoint**, for example
`taskboard-db.abc123xyz.ap-south-1.rds.amazonaws.com`.

---

## Phase 4: Backend (EC2)

### 4.1 Launch the server

EC2 console > Launch instance:

- Name: `taskboard-api`
- AMI: **Amazon Linux 2023**
- Type: `t3.micro` (or `t2.micro`, whichever shows "Free tier eligible")
- Key pair: create new, download the `.pem` file, keep it safe
- Network: default VPC, **Auto-assign public IP: Enable**
- Security group: choose existing `taskboard-ec2-sg`

Copy the instance's **Public IPv4 DNS** (like `ec2-13-233-1-2.ap-south-1.compute.amazonaws.com`).

> Tip: an instance's public address changes when you stop and start it. To keep it fixed, allocate an **Elastic IP** and associate it with the instance.

### 4.2 Connect

```bash
chmod 400 mykey.pem
ssh -i mykey.pem ec2-user@<EC2-PUBLIC-DNS>
```

### 4.3 Install software

```bash
sudo dnf install -y git
git clone https://github.com/<you>/<repo>.git app
bash app/deploy/ec2-setup.sh      # installs nginx, node, npm, pm2
node -v                           # should print a version
```

### 4.4 Configure and start the API

```bash
cd ~/app/backend
cp .env.example .env
nano .env
```

Set these values:

```
PORT=5000
DB_HOST=<your RDS endpoint>
DB_PORT=5432
DB_NAME=taskboard
DB_USER=postgres
DB_PASSWORD=<your password>
DB_SSL=true
```

Then:

```bash
npm install --omit=dev
pm2 start ../deploy/ecosystem.config.js
pm2 save
pm2 startup          # run the command it prints, so PM2 starts on reboot
pm2 logs             # look for "API running on port 5000"
```

If you see a connection error, go to the Troubleshooting table at the bottom.

### 4.5 Nginx

```bash
sudo cp ~/app/deploy/nginx.conf /etc/nginx/conf.d/taskboard.conf
sudo nginx -t                 # must say "syntax is ok"
sudo systemctl reload nginx
```

### 4.6 Test from your own computer

Open `http://<EC2-PUBLIC-DNS>/api/health` in a browser. Expected:

```json
{"status":"ok","database":"connected","time":"..."}
```

If you get this, **backend and database are fully working**.

---

## Phase 5: Frontend files (S3)

1. S3 console > Create bucket, e.g. `taskboard-frontend-<yourname>-<random>` (names are globally unique).
2. Keep **Block all public access = ON**. CloudFront will read the files privately.
3. Build and upload from your computer:

```bash
cd frontend
npm install
npm run build
aws s3 sync dist/ s3://<your-bucket-name> --delete
```

(No AWS CLI? Upload the **contents** of `frontend/dist` through the S3 console instead.)

---

## Phase 6: CloudFront (connect everything)

CloudFront console > Create distribution.

**Origin 1: S3 (frontend)**
- Origin domain: your S3 bucket
- Origin access: **Origin access control (OAC)** > create new
- Default root object: `index.html`
- Default behavior: viewer protocol policy **Redirect HTTP to HTTPS**

When asked, copy the generated **bucket policy** and paste it in S3 > bucket > Permissions > Bucket policy.

**Origin 2: EC2 (backend)**
- Origins tab > Create origin
- Origin domain: paste the EC2 **Public IPv4 DNS**
- Protocol: **HTTP only**, port 80
- Name: `ec2-api`

**Behavior for the API**
- Behaviors tab > Create behavior
- Path pattern: `/api/*`
- Origin: `ec2-api`
- Viewer protocol: Redirect HTTP to HTTPS
- Allowed HTTP methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
- Cache policy: **CachingDisabled**
- Origin request policy: **AllViewer**

Wait for status **Deployed** (about 5 minutes). Open `https://<id>.cloudfront.net`.
You now have a live full-stack app on HTTPS.

---

## Phase 7: How to ship updates later

| What changed | What to do |
|---|---|
| Frontend | `bash deploy/frontend-deploy.sh <bucket> <distribution-id>` |
| Backend | SSH in, then `cd ~/app && git pull && cd backend && npm install --omit=dev && pm2 restart taskboard-api` |
| Database table | Edit `initDb()` in `backend/src/db.js` (or connect with `psql` from EC2), then restart the API |

To run SQL on RDS, use the EC2 server as a stepping stone:

```bash
sudo dnf install -y postgresql15
psql -h <rds-endpoint> -U postgres -d taskboard
```

---

## Phase 8: Hardening (do this once it works)

| Improvement | How |
|---|---|
| Only CloudFront can reach EC2 | In `taskboard-ec2-sg`, replace the port 80 source with the managed prefix list `com.amazonaws.global.cloudfront.origin-facing` |
| Don't keep DB password in a file | Store it in **Secrets Manager** or SSM Parameter Store |
| Custom domain | Route 53 + a free ACM certificate (must be requested in `us-east-1` for CloudFront) |
| Auto deploy | GitHub Actions: build, `s3 sync`, invalidate CloudFront |
| Monitoring | CloudWatch alarms for EC2 CPU and RDS storage |

---

## Phase 9: Clean up (avoid surprise bills)

Delete in this order:

1. CloudFront distribution: **Disable**, wait, then Delete
2. EC2 instance: Terminate (and release any Elastic IP)
3. RDS database: Delete (skip the final snapshot if you don't need it)
4. S3 bucket: Empty, then Delete
5. Security groups: delete `taskboard-rds-sg` first, then `taskboard-ec2-sg`

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pm2 logs` shows `ETIMEDOUT` to DB | RDS security group doesn't allow EC2 | Check `taskboard-rds-sg` has port 5432 from `taskboard-ec2-sg`, and the RDS uses that group |
| `no pg_hba.conf entry ... no encryption` | SSL is off | Set `DB_SSL=true`, then `pm2 restart taskboard-api` |
| `password authentication failed` | Wrong DB password/user | Fix `.env`, restart PM2 |
| `database "taskboard" does not exist` | Initial DB name was skipped | Create it with `psql`: `CREATE DATABASE taskboard;` |
| `502 Bad Gateway` from Nginx | Node isn't running | `pm2 status`, `pm2 logs` |
| Health URL on EC2 DNS times out | Port 80 blocked or no public IP | Check the EC2 security group and public IP |
| Site loads but "Backend not reachable" | `/api/*` behavior missing or wrong | Check the CloudFront behavior order and that origin = EC2 |
| S3 files give `AccessDenied` | Bucket policy for OAC missing | Paste the policy CloudFront gave you |
| Old frontend still showing | CloudFront cache | Create an invalidation for `/*` |
| API works on EC2 but not via CloudFront | Methods or cache policy | Allow all methods, use CachingDisabled |

## Rough cost (check the AWS pricing pages for current numbers)

| Service | Notes |
|---|---|
| EC2 `t3.micro` | Free tier for new accounts for a limited time, small hourly cost after |
| RDS `db.t3.micro` | Same: free tier at first, then hourly + storage |
| S3 | Pennies for a small site |
| CloudFront | Generous free allowance |
| **Biggest risk** | Forgetting to delete things. Do Phase 9 when you finish |
