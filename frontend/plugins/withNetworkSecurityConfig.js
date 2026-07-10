const { withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withNetworkSecurityConfig = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    
    if (!androidManifest.manifest.application) {
      return config;
    }
    
    const mainApplication = androidManifest.manifest.application[0];
    
    if (!mainApplication.$) {
      mainApplication.$ = {};
    }

    if (!mainApplication.$['android:networkSecurityConfig']) {
      mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }

    const xmlDir = path.join(
      config.modRequest.platformProjectRoot,
      'app/src/main/res/xml'
    );

    if (!fs.existsSync(xmlDir)) {
      fs.mkdirSync(xmlDir, { recursive: true });
    }

    const networkSecurityConfigPath = path.join(
      xmlDir,
      'network_security_config.xml'
    );

    const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">172.236.188.162</domain>
    </domain-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>`;

    fs.writeFileSync(networkSecurityConfigPath, networkSecurityConfig);

    return config;
  });
};

module.exports = withNetworkSecurityConfig;
