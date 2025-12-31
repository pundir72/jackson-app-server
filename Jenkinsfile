pipeline {
    agent any

    environment {
        BRANCH_NAME = 'main-v3'
        ENV_FILE_PATH = '/var/www/env-backups/.env.jackson-app-server'
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

        stage('Gitleaks Secret Scan') {
            steps {
                sh '''
                    echo "🔐 Running Gitleaks secret scan..."

                    if ! command -v gitleaks >/dev/null 2>&1; then
                    curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_8.18.2_linux_x64.tar.gz -o gitleaks.tar.gz
                    tar -xzf gitleaks.tar.gz
                    chmod +x gitleaks
                    sudo mv gitleaks /usr/local/bin/
                    fi

                    gitleaks detect --source . --exit-code 1
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
                ls -la ${WORKSPACE}/.env
                '''
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                docker build -t jackson-app-server:${BUILD_NUMBER} .
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
                  jackson-app-server:${BUILD_NUMBER}

                echo "🚀 Docker container deployed successfully!"
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
