Usage: aws-lambda-deploy <options> <functions>
Deploy Lambda function(s) to AWS

  options:
    -r|--region <aws region> AWS region (eu-west-1)
    -h|--help

  functions:
    List of function folders to deploy to AWS. The release will be built as release.zip, and left in the folder, overwriting all previous zip files

  function configs:
    Each function folder should contain a deployment config file, called deployConf.js, which looks like this:
    module.exports = {
      ReleaseFiles: 'FILES_TO_DEPLOY (app.js)',
      DevModules: 'NODE_MODULES_TO_EXCLUDE',
      Lamda: {
        FunctionName: 'AWS_LAMBDA_FUNCTION_NAME',
        Handler: 'LAMBDA_APP_HANDLER_NAME (app.handler)',
        Role: 'LAMBDA_ROLE_NAME',
        MemorySize: LAMBDA_MEMORY_SIZE (128),
        Timeout: LAMBDA_TIMEOUT (3)
      }
    }

AWS credentials should be configured in ~/.aws/credentials as such:
    [default]
    aws_access_key_id = ACCESS_KEY_ID
    aws_secret_access_key = SECRET_ACCESS_KEY
