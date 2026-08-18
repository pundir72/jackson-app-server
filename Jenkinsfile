pipeline {
    agent any

    parameters {
        booleanParam(name: 'RUN_TESTS', defaultValue: true, description: 'Run unit tests')
        booleanParam(name: 'RUN_GITLEAKS', defaultValue: true, description: 'Run secrets scan')
        booleanParam(name: 'RUN_SONAR', defaultValue: false, description: 'Run SonarQube analysis')
        booleanParam(name: 'RUN_AUDIT', defaultValue: true, description: 'Run npm dependency audit')
        booleanParam(name: 'RUN_IMAGE_SCAN', defaultValue: true, description: 'Run container image scan')
        booleanParam(name: 'PUSH_IMAGE', defaultValue: false, description: 'Push image to registry')
        booleanParam(name: 'RUN_LOAD_TESTS', defaultValue: false, description: 'Run k6 smoke tests')
    }

    environment {
        BRANCH_NAME = 'main-v3'
        ENV_FILE_PATH = '/var/www/env-backups/.env.jackson-app-server'
        IMAGE_NAME = 'jackson-app-server'
        IMAGE_TAG = "${BUILD_NUMBER}"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout([$class: 'GitSCM',
                    branches: [[name: "${BRANCH_NAME}"]],
                    doGenerateSubmoduleConfigurations: false,
                    extensions: [[$class: 'WipeWorkspace']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/pundir72/jackson-app-server.git',
                        credentialsId: 'jackson-github'
                    ]]
                ])
            }
        }

        stage('Install Dependencies') {
            steps {
                sh '''
                npm ci
                '''
            }
        }

        stage('Lint') {
            steps {
                sh '''
                npm run lint
                '''
            }
        }

        stage('Unit Tests') {
            when {
                expression { return params.RUN_TESTS }
            }
            steps {
                sh '''
                npm test -- --runInBand
                '''
            }
        }

        stage('Gitleaks Secret Scan') {
            when {
                expression { return params.RUN_GITLEAKS }
            }
            steps {
                sh '''
                docker run --rm \
                    -v "$PWD:/repo" \
                    zricethezav/gitleaks:latest detect \
                    --source="/repo" \
                    --report-format=json \
                    --report-path=/repo/gitleaks-report.json \
                    --exit-code=1
                '''
            }
        }

        stage('SonarQube Analysis') {
            when {
                expression { return params.RUN_SONAR }
            }
            steps {
                sh '''
                if [ -z "${SONAR_HOST_URL}" ] || [ -z "${SONAR_PROJECT_KEY}" ] || [ -z "${SONAR_TOKEN}" ]; then
                    echo "❌ SonarQube env vars missing: SONAR_HOST_URL, SONAR_PROJECT_KEY, SONAR_TOKEN"
                    exit 1
                fi

                docker run --rm \
                    -e SONAR_HOST_URL="${SONAR_HOST_URL}" \
                    -e SONAR_LOGIN="${SONAR_TOKEN}" \
                    -v "$PWD:/usr/src" \
                    sonarsource/sonar-scanner-cli:latest \
                    -Dsonar.projectKey="${SONAR_PROJECT_KEY}" \
                    -Dsonar.sources=. \
                    -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                    -Dsonar.exclusions=**/node_modules/**,**/uploads/**
                '''
            }
        }

        stage('Dependency Audit') {
            when {
                expression { return params.RUN_AUDIT }
            }
            steps {
                sh '''
                npm audit --audit-level=high
                '''
            }
        }

        stage('Copy .env') {
            steps {
                sh '''
                if [ ! -f "${ENV_FILE_PATH}" ]; then
                    echo "❌ .env file not found at ${ENV_FILE_PATH}"
                    exit 1
                fi

                cp ${ENV_FILE_PATH} ${WORKSPACE}/.env
                echo "✅ .env file copied to workspace"

                # Stamp this build as the Sentry release so every error
                # maps to the exact deploy that introduced it
                sed -i '/^SENTRY_RELEASE=/d' ${WORKSPACE}/.env
                echo "SENTRY_RELEASE=build-${BUILD_NUMBER}" >> ${WORKSPACE}/.env
                echo "✅ SENTRY_RELEASE=build-${BUILD_NUMBER} stamped into .env"

                ls -la ${WORKSPACE}/.env
                '''
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .
                '''
            }
        }

        stage('Image Scan (Trivy)') {
            when {
                expression { return params.RUN_IMAGE_SCAN }
            }
            steps {
                sh '''
                docker run --rm \
                    -v /var/run/docker.sock:/var/run/docker.sock \
                    aquasec/trivy:latest image \
                    --exit-code 1 \
                    --severity HIGH,CRITICAL \
                    ${IMAGE_NAME}:${IMAGE_TAG}
                '''
            }
        }

        stage('Push Image') {
            when {
                expression { return params.PUSH_IMAGE }
            }
            steps {
                sh '''
                REGISTRY="${IMAGE_REGISTRY}"
                if [ -z "${REGISTRY}" ] && [ -n "${DOCKERHUB_USERNAME}" ]; then
                    REGISTRY="docker.io/${DOCKERHUB_USERNAME}"
                fi

                if [ -z "${REGISTRY}" ]; then
                    echo "❌ IMAGE_REGISTRY not set and DOCKERHUB_USERNAME missing"
                    exit 1
                fi

                docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
                docker push ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
                '''
            }
        }

        stage('Deploy Container') {
            steps {
                sh '''
                docker stop jackson-app-server || true
                docker rm jackson-app-server || true

                if [ ! -f "${WORKSPACE}/.env" ]; then
                    echo "❌ .env file missing. Deployment aborted!"
                    exit 1
                fi

                docker run -d \
                  --env-file ${WORKSPACE}/.env \
                  -p 4001:4001 \
                  --name jackson-app-server \
                  ${IMAGE_NAME}:${IMAGE_TAG}

                echo "🚀 Docker container deployed successfully!"
                '''
            }
        }

        stage('Load Test (k6)') {
            when {
                expression { return params.RUN_LOAD_TESTS }
            }
            steps {
                sh '''
                BASE_URL="http://localhost:4001" bash scripts/run-k6.sh load-tests/k6-smoke.js
                '''
            }
        }
    }

    post {
        success {
            echo "✅ Deployment successful!"
        }
        failure {
            echo "❌ Build failed — secrets or errors detected."
        }
    }
}
