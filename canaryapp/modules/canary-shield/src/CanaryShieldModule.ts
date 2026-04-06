import { requireNativeModule } from "expo-modules-core";

/**
 * Native module bridge for the CanaryShield scam detection service.
 * Exposes Kotlin TFLite inference and permission status to JS.
 */
const CanaryShieldModule = requireNativeModule("CanaryShield");

export default CanaryShieldModule;
