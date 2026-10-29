// CI-only screenshot harness. The production App.tsx and TestFlight build are
// never changed by this file in the developer's checkout. No secrets are used.
import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';import {fileURLToPath,pathToFileURL} from 'node:url';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url)),app=path.join(root,'apps/ios'),plan=process.argv.includes('--plan');if(!plan&&process.env.CI!=='true')throw Error('This harness may modify only an isolated CI checkout');
const out=plan?path.resolve(process.argv[3]??'simulator-capture-plan'):path.join(app,'.simulator-capture');await mkdir(out,{recursive:true});await mkdir(path.join(out,'export'),{recursive:true});
const original=await readFile(path.join(app,'App.tsx'),'utf8');let capture=original;const once=(old,value)=>{if(capture.split(old).length!==2)throw Error('Native capture anchor changed');capture=capture.replace(old,value);};
once('StyleSheet,Text,View}', 'StyleSheet,Text,View,Settings}');
once("useState(APP_ORIGIN+'/')", "useState((()=>{const value=Settings.get('SchiildCaptureURL');return typeof value==='string'&&/^https:\\/\\/schiild\\.app\\/week\\/\\?lang=(ja|en|fr|nl|es|it|ko|id|km|hi)$/.test(value)?value:APP_ORIGIN+'/';})())");
if(!plan)await writeFile(path.join(app,'App.tsx'),capture);
const require=createRequire(await realpath(path.join(root,'apps/demo/node_modules/wrangler/package.json'))),esbuild=await import(pathToFileURL(require.resolve('esbuild')).href);
const labelsFile=path.join(out,'labels.mjs');await esbuild.build({stdin:{contents:"import {t} from './apps/demo/src/copy.ts';import {activateLanguage} from './apps/demo/src/language.ts';const labels={};for(const language of ['ja','en','fr','nl','es','it','ko','id','km','hi']){activateLanguage(language);labels[language]=t('archive.title');}export default labels;",resolveDir:root},outfile:labelsFile,bundle:true,platform:'node',format:'esm',target:'es2022',logLevel:'warning'});const labels=(await import(pathToFileURL(labelsFile).href)).default;
const swift=`import XCTest
final class CaptureUITests: XCTestCase {
 func testCapture() throws {
  continueAfterFailure = false
  let labelsJSON = #"${JSON.stringify(labels)}"#
  let labels = try JSONDecoder().decode([String:String].self, from: Data(labelsJSON.utf8))
  let app = XCUIApplication()
  for language in ["ja","en","fr","nl","es","it","ko","id","km","hi"] {
   app.launchArguments = ["-SchiildCaptureURL", "https://schiild.app/week/?lang=" + language]
   app.launch()
   XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 90))
   let global = app.buttons.matching(NSPredicate(format: "label == %@", "GLOBAL SCHIILD"))
   XCTAssertTrue(global.firstMatch.waitForExistence(timeout: 90))
   Thread.sleep(forTimeInterval: 4)
   save(app, language, "01-atelier")
   try XCTUnwrap(global.allElementsBoundByIndex.last).tap()
   Thread.sleep(forTimeInterval: 4)
   save(app, language, "02-global")
   let archive = app.buttons.matching(NSPredicate(format: "label == %@", labels[language]!))
   XCTAssertTrue(archive.firstMatch.waitForExistence(timeout: 30))
   try XCTUnwrap(archive.allElementsBoundByIndex.last).tap()
   Thread.sleep(forTimeInterval: 4)
   save(app, language, "03-archive")
   app.terminate()
  }
 }
 private func save(_ app: XCUIApplication, _ language: String, _ screen: String) {
  let attachment = XCTAttachment(screenshot: app.screenshot())
  attachment.name = "schiild-" + language + "-" + screen
  attachment.lifetime = .keepAlways
  add(attachment)
 }
}
`;
await writeFile(path.join(out,'CaptureUITests.swift'),swift);
await writeFile(path.join(out,'add-target.rb'),`require 'xcodeproj'
project_path = Dir['apps/ios/ios/*.xcodeproj'].first
abort('Missing generated Xcode project') unless project_path
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.product_type == 'com.apple.product-type.application' }
abort('Missing native app target') unless app
target = project.new_target(:ui_test_bundle, 'SchiildCaptureUITests', :ios, '16.0')
target.add_dependency(app)
group = project.main_group.new_group('SchiildCaptureUITests')
reference = group.new_file(File.expand_path('apps/ios/.simulator-capture/CaptureUITests.swift'))
target.add_file_references([reference])
target.build_configurations.each do |config|
 config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
 config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'app.schiild.mobile.capturetests'
 config.build_settings['SWIFT_VERSION'] = '5.0'
 config.build_settings['TEST_TARGET_NAME'] = app.name
 config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(target)
scheme.launch_action.build_configuration = 'Release'
scheme.test_action.build_configuration = 'Release'
scheme.save_as(project_path, 'SchiildCapture', true)
`);
await writeFile(path.join(out,'run.sh'),`#!/bin/bash
set -euo pipefail
ruby apps/ios/.simulator-capture/add-target.rb
CAPTURE_DIR="$PWD/apps/ios/.simulator-capture"
WORKSPACE=$(find apps/ios/ios -maxdepth 1 -name '*.xcworkspace' -print -quit)
test -n "$WORKSPACE"
for attempt in $(seq 1 60); do
 if curl -fsS https://schiild.app/week/scenario.json | grep -q 'generated-demo-v1'; then break; fi
 if [ "$attempt" = 60 ]; then echo 'New demo media not published'; exit 1; fi
 sleep 5
done
xcodebuild -workspace "$WORKSPACE" -scheme SchiildCapture -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath "$CAPTURE_DIR/build" CODE_SIGNING_ALLOWED=NO build-for-testing > "$CAPTURE_DIR/export/build.log" 2>&1 || { tail -n 100 "$CAPTURE_DIR/export/build.log"; exit 1; }
node apps/ios/scripts/simulator-devices.mjs > "$CAPTURE_DIR/devices.tsv"
while IFS=$'\\t' read -r family device_type runtime; do
 simulator=$(xcrun simctl create "Schiild-Capture-$family" "$device_type" "$runtime")
 xcrun simctl boot "$simulator"
 xcrun simctl bootstatus "$simulator" -b
 xcrun simctl status_bar "$simulator" override --time '9:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState charged --batteryLevel 100
 result="$CAPTURE_DIR/$family.xcresult"
 xcodebuild -workspace "$WORKSPACE" -scheme SchiildCapture -configuration Release -destination "id=$simulator" -derivedDataPath "$CAPTURE_DIR/build" -resultBundlePath "$result" CODE_SIGNING_ALLOWED=NO test-without-building > "$CAPTURE_DIR/export/$family-test.log" 2>&1 || { tail -n 100 "$CAPTURE_DIR/export/$family-test.log"; exit 1; }
 mkdir -p "$CAPTURE_DIR/export/$family"
 xcrun xcresulttool export attachments --path "$result" --output-path "$CAPTURE_DIR/export/$family"
 xcrun simctl shutdown "$simulator"
 xcrun simctl delete "$simulator"
done < "$CAPTURE_DIR/devices.tsv"
`);
await writeFile(path.join(out,'export','provenance.json'),JSON.stringify({kind:'native-ios-simulator',sourceAppSha256:createHash('sha256').update(original).digest('hex'),captureAppSha256:createHash('sha256').update(capture).digest('hex'),sourceCommit:process.env.GITHUB_SHA??null,fictionalFeatureClearlyLabelled:true,startURLOnlyTestOverride:true,productionAppModified:false,noAuthenticationCredentials:true,languages:Object.keys(labels)},null,2));
console.log({prepared:true,plan,out,languages:Object.keys(labels).length});
