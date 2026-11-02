'use strict';
// Root installs only an independently reviewed immutable pre-funding amendment in this source registry.
// Request parameters, packet hashes and caller booleans cannot add an approved binding.
const APPROVED_BINDING=Object.freeze({"amendmentSha256":"f2338e2fae18c25d3e686c5159c65a6c49598e3c77e15daf0725e95562daac86","feedId":"independent-native-20261102-b","feedManifestHash":"07112ef0955fa45f1062103a449f147406732b2c0e5c977be8e3ba45ccfc2027","originalProtocolHash":"f264ee8a14164a6d9ad3e768e9fd90535d398cf1b6875e5a38bb783657b0917d","earliestInitialSession":"2026-11-03"});
const ORIGINAL_PROTOCOL_HASH='f264ee8a14164a6d9ad3e768e9fd90535d398cf1b6875e5a38bb783657b0917d';
function approved(){if(!APPROVED_BINDING||APPROVED_BINDING.originalProtocolHash!==ORIGINAL_PROTOCOL_HASH||!/^2026-11-0[23]$/.test(APPROVED_BINDING.earliestInitialSession||'')||APPROVED_BINDING.feedId!=='independent-native-20261102-b'||!/^[a-f0-9]{64}$/.test(APPROVED_BINDING.amendmentSha256||'')||!/^[a-f0-9]{64}$/.test(APPROVED_BINDING.feedManifestHash||''))throw Error('No approved independent source binding installed');return APPROVED_BINDING;}
function validateProvenance(prov,protocol){
 if(!prov)throw Error('Missing source provenance');
 if(prov.sourceBindingHash===undefined){if(prov.accountId!==protocol.sourceAccount||prov.sourceManifestHash!==protocol.sourceManifestHash)throw Error('Legacy source provenance mismatch');return null;}
 const b=approved();if(prov.sourceBindingHash!==b.amendmentSha256||prov.accountId!==b.feedId||prov.sourceManifestHash!==b.feedManifestHash)throw Error('Independent source binding mismatch');return b.amendmentSha256;
}
function validateActivation(activation){if(activation.sourceBindingHash===undefined)return null;const b=approved();if(activation.sourceBindingHash!==b.amendmentSha256||activation.sourceFeedId!==b.feedId||activation.sourceFeedManifestHash!==b.feedManifestHash)throw Error('Activation source binding mismatch');return b;}
function assertStateBinding(state,bindingHash){if((state?.sourceBindingHash??null)!==bindingHash)throw Error('Existing funded state source binding cannot change');}
module.exports={approved,validateProvenance,validateActivation,assertStateBinding};
