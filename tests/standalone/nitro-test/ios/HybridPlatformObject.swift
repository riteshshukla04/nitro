//
//  HybridPlatformObject.swift
//  react-native-nitro-test
//
//  Created by Marc Rousavy on 27.10.25.
//

import NitroModules
import Foundation

class HybridPlatformObject: HybridPlatformObjectSpec {
  func getOSVersion() -> String {
    let version = ProcessInfo.processInfo.operatingSystemVersion
    let baseVersion = "\(version.majorVersion).\(version.minorVersion)"
    return version.patchVersion == 0 ? baseVersion : "\(baseVersion).\(version.patchVersion)"
  }
}
