#! /usr/bin/env node

var bb = require ( 'bluebird' );
var fs = bb.promisifyAll ( require ( 'fs' ) );
var hl = require ( 'highland' );
var _ = require ( 'lodash' );
var args = require ( 'minimist' )( process.argv );
var plainArgs = _.reject ( args._, function ( arg ) {
    return ( arg.match ( 'node' ) || arg.match ( '.js' ) );
} );
var recursive = bb.promisify ( require ( 'recursive-readdir' ) );
var aws = require ( 'aws-sdk' );
var lambda = new aws.Lambda ( { region: args.r || args.region || 'eu-west-1' } );
var spawn = require ( 'child_process' ).spawn;

var usage = function () {
    console.log ( 'Usage: aws-lambda-deploy <options> <functions>' );
    console.log ( 'Deploy Lambda function(s) to AWS' );
    console.log ( '' );
    console.log ( '  options:' );
    console.log ( '    -r|--region <aws region> AWS region (eu-west-1)' );
    console.log ( '    -h|--help' );
    console.log ( '' );
    console.log ( '  functions:' );
    console.log ( '    List of function folders to deploy to AWS. The release will be built as release.zip, and left in the folder, overwriting all previous zip files' );
    console.log ( '' );
    console.log ( '  function configs:' );
    console.log ( '    Each function folder should contain a deployment config file, called deployConf.js, which looks like this:' );
    console.log ( '    module.exports = {' );
    console.log ( '      ReleaseFiles: \'FILES_TO_DEPLOY (app.js)\',' );
    console.log ( '      DevModules: \'NODE_MODULES_TO_EXCLUDE\',' );
    console.log ( '      Lamda: {' );
    console.log ( '        FunctionName: \'AWS_LAMBDA_FUNCTION_NAME\',' );
    console.log ( '        Handler: \'LAMBDA_APP_HANDLER_NAME (app.handler)\',' );
    console.log ( '        Role: \'LAMBDA_ROLE_NAME\',' );
    console.log ( '        MemorySize: LAMBDA_MEMORY_SIZE (128),' );
    console.log ( '        Timeout: LAMBDA_TIMEOUT (3)' );
    console.log ( '      }' );
    console.log ( '    }' );
    console.log ( '' );
    console.log ( 'AWS credentials should be configured in ~/.aws/credentials as such:' );
    console.log ( '    [default]' );
    console.log ( '    aws_access_key_id = ACCESS_KEY_ID' );
    console.log ( '    aws_secret_access_key = SECRET_ACCESS_KEY' );
    process.exit ( 1 );
};

if ( ! _.isUndefined ( args.h || args.help ) || _.isEmpty ( plainArgs ) ) {
    usage ();
}

_.each ( plainArgs, function ( moduleDir ) {
    var deployConf = require ( moduleDir + '/deployConf.js' );

    var lambdaConf = _.merge ( {
        Handler: 'app.handler',
        MemorySize: 128,
        Timeout: 3
    }, deployConf.Lambda );

    var releaseConf = _.merge ( {
        ReleaseFiles: [ 'app.js' ],
        DevModules: [ 'aws-sdk' ]
    }, _.omit ( deployConf, [ 'Lambda' ] ) );

    var releaseFiles = releaseConf.ReleaseFiles;
    var devModules = releaseConf.DevModules;

    var zipArgs = _.flatten ( [
        [ '-r', 'release' ],
        releaseFiles,
        [ 'node_modules', '-x' ],
        _.map ( devModules, function ( devModule ) {
            return 'node_modules/' + devModule + '/*';
        } )
    ] );

    var missingLambdaAttrs = _.filter ( [ 'FunctionName', 'Role' ], function ( attr ) {
        return _.isUndefined ( lambdaConf[attr] );
    } );

    if ( ! _.isEmpty ( missingLambdaAttrs ) ) {
        _.each ( missingLambdaAttrs, function ( attr ) {
            console.error ( moduleDir + ' deployment config has no "' + attr + '" attribute' );
        } );
        return;
    }

    hl ( fs.readdirAsync ( moduleDir ) )

    .flatMap ( function ( files ) {
        return hl ( files );
    } )

    .filter ( function ( fileName ) {
        return fileName.match ( /\.zip$/ );
    } )

    .map ( function ( fileName ) {
        return moduleDir + '/' + fileName;
    } )

    .flatMap ( function ( zipFile ) {
        return hl ( fs.unlinkAsync ( zipFile ) )
        
        .map ( function ( undef ) {
            return zipFile;
        } );
    } )

    .toArray ( function ( listOfDeletedFiles ) {
        var zip = spawn ( 'zip', zipArgs, { cwd: moduleDir } );

        console.log ( 'zip', zipArgs, { cwd: moduleDir } );

        zip.on ( 'close', function ( code ) {
            if ( code === 0 ) {
                fs.readFile ( moduleDir + '/release.zip', function ( error, zipBuffer ) {
                    if ( error ) {
                        console.error ( error );
                        return;
                    }

                    lambda.uploadFunction ( _.extend ( lambdaConf, {
                        FunctionZip: zipBuffer,
                        Mode: 'event',
                        Runtime: 'nodejs',
                    } ), function ( error, result ) {
                        if ( error ) {
                            console.error ( error );
                            return;
                        }

                        console.log ( result );
                    } );
                } );
            } else {
                console.error ( 'zip failed' );
            }
        } )
    } );
} );
