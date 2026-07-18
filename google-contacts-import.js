// Normalizes raw Google Contacts CSV export rows into prospect candidates
// {name, phone, country} ready for db.bulkImportProspects. Runs entirely on
// the server so users can upload the unmodified export straight from
// Google — no separate conversion tool required.
//
// Expected input shape: parsed CSV rows (objects keyed by the header row)
// from a Google Contacts "Export" — columns like "First Name", "Last Name",
// "Phone 1 - Value", "Phone 2 - Value", etc. Google emits one "Phone N -
// Value" column per contact's max phone count, and a single field can hold
// multiple numbers joined by ":::" — both are handled here.
//
// Also accepts the older pre-normalized format (Name, Country Code, Phone
// Number, Country) for backward compatibility with files produced by the
// standalone conversion tool, in case anyone still has one lying around.
const { PhoneNumberUtil, PhoneNumberFormat } = require('google-libphonenumber');
const PNF = PhoneNumberFormat;
const phoneUtil = PhoneNumberUtil.getInstance();

// Default region used to interpret phone numbers that have no leading "+"
// (Google sometimes exports local numbers without a country code). Adjust
// if the target user base shifts to a different primary country.
const DEFAULT_REGION = 'CM';

const countryNameMap = {
    'AD': 'Andorra',
    'AE': 'United Arab Emirates',
    'AF': 'Afghanistan',
    'AG': 'Antigua and Barbuda',
    'AI': 'Anguilla',
    'AL': 'Albania',
    'AM': 'Armenia',
    'AO': 'Angola',
    'AQ': 'Antarctica',
    'AR': 'Argentina',
    'AS': 'American Samoa',
    'AT': 'Austria',
    'AU': 'Australia',
    'AW': 'Aruba',
    'AX': 'Åland Islands',
    'AZ': 'Azerbaijan',
    'BA': 'Bosnia and Herzegovina',
    'BB': 'Barbados',
    'BD': 'Bangladesh',
    'BE': 'Belgium',
    'BF': 'Burkina Faso',
    'BG': 'Bulgaria',
    'BH': 'Bahrain',
    'BI': 'Burundi',
    'BJ': 'Benin',
    'BL': 'Saint Barthélemy',
    'BM': 'Bermuda',
    'BN': 'Brunei Darussalam',
    'BO': 'Bolivia',
    'BQ': 'Bonaire, Sint Eustatius and Saba',
    'BR': 'Brazil',
    'BS': 'Bahamas',
    'BT': 'Bhutan',
    'BV': 'Bouvet Island',
    'BW': 'Botswana',
    'BY': 'Belarus',
    'BZ': 'Belize',
    'CA': 'Canada',
    'CC': 'Cocos (Keeling) Islands',
    'CD': 'Democratic Republic of the Congo',
    'CF': 'Central African Republic',
    'CG': 'Congo',
    'CH': 'Switzerland',
    'CI': 'Côte d’Ivoire',
    'CK': 'Cook Islands',
    'CL': 'Chile',
    'CM': 'Cameroun',
    'CN': 'China',
    'CO': 'Colombia',
    'CR': 'Costa Rica',
    'CU': 'Cuba',
    'CV': 'Cabo Verde',
    'CW': 'Curaçao',
    'CX': 'Christmas Island',
    'CY': 'Cyprus',
    'CZ': 'Czech Republic',
    'DE': 'Germany',
    'DJ': 'Djibouti',
    'DK': 'Denmark',
    'DM': 'Dominica',
    'DO': 'Dominican Republic',
    'DZ': 'Algeria',
    'EC': 'Ecuador',
    'EE': 'Estonia',
    'EG': 'Egypt',
    'EH': 'Western Sahara',
    'ER': 'Eritrea',
    'ES': 'Spain',
    'ET': 'Ethiopia',
    'FI': 'Finland',
    'FJ': 'Fiji',
    'FK': 'Falkland Islands',
    'FM': 'Micronesia',
    'FO': 'Faroe Islands',
    'FR': 'France',
    'GA': 'Gabon',
    'GB': 'United Kingdom',
    'GD': 'Grenada',
    'GE': 'Georgia',
    'GF': 'French Guiana',
    'GG': 'Guernsey',
    'GH': 'Ghana',
    'GI': 'Gibraltar',
    'GL': 'Greenland',
    'GM': 'Gambia',
    'GN': 'Guinea',
    'GP': 'Guadeloupe',
    'GQ': 'Equatorial Guinea',
    'GR': 'Greece',
    'GS': 'South Georgia and the South Sandwich Islands',
    'GT': 'Guatemala',
    'GU': 'Guam',
    'GW': 'Guinea-Bissau',
    'GY': 'Guyana',
    'HK': 'Hong Kong',
    'HM': 'Heard Island and McDonald Islands',
    'HN': 'Honduras',
    'HR': 'Croatia',
    'HT': 'Haiti',
    'HU': 'Hungary',
    'ID': 'Indonesia',
    'IE': 'Ireland',
    'IL': 'Israel',
    'IM': 'Isle of Man',
    'IN': 'India',
    'IO': 'British Indian Ocean Territory',
    'IQ': 'Iraq',
    'IR': 'Iran',
    'IS': 'Iceland',
    'IT': 'Italy',
    'JE': 'Jersey',
    'JM': 'Jamaica',
    'JO': 'Jordan',
    'JP': 'Japan',
    'KE': 'Kenya',
    'KG': 'Kyrgyzstan',
    'KH': 'Cambodia',
    'KI': 'Kiribati',
    'KM': 'Comoros',
    'KN': 'Saint Kitts and Nevis',
    'KP': 'North Korea',
    'KR': 'South Korea',
    'KW': 'Kuwait',
    'KY': 'Cayman Islands',
    'KZ': 'Kazakhstan',
    'LA': 'Laos',
    'LB': 'Lebanon',
    'LC': 'Saint Lucia',
    'LI': 'Liechtenstein',
    'LK': 'Sri Lanka',
    'LR': 'Liberia',
    'LS': 'Lesotho',
    'LT': 'Lithuania',
    'LU': 'Luxembourg',
    'LV': 'Latvia',
    'LY': 'Libya',
    'MA': 'Morocco',
    'MC': 'Monaco',
    'MD': 'Moldova',
    'ME': 'Montenegro',
    'MF': 'Saint Martin',
    'MG': 'Madagascar',
    'MH': 'Marshall Islands',
    'MK': 'North Macedonia',
    'ML': 'Mali',
    'MM': 'Myanmar',
    'MN': 'Mongolia',
    'MO': 'Macao',
    'MP': 'Northern Mariana Islands',
    'MQ': 'Martinique',
    'MR': 'Mauritania',
    'MS': 'Montserrat',
    'MT': 'Malta',
    'MU': 'Mauritius',
    'MV': 'Maldives',
    'MW': 'Malawi',
    'MX': 'Mexico',
    'MY': 'Malaysia',
    'MZ': 'Mozambique',
    'NA': 'Namibia',
    'NC': 'New Caledonia',
    'NE': 'Niger',
    'NF': 'Norfolk Island',
    'NG': 'Nigeria',
    'NI': 'Nicaragua',
    'NL': 'Netherlands',
    'NO': 'Norway',
    'NP': 'Nepal',
    'NR': 'Nauru',
    'NU': 'Niue',
    'NZ': 'New Zealand',
    'OM': 'Oman',
    'PA': 'Panama',
    'PE': 'Peru',
    'PF': 'French Polynesia',
    'PG': 'Papua New Guinea',
    'PH': 'Philippines',
    'PK': 'Pakistan',
    'PL': 'Poland',
    'PM': 'Saint Pierre and Miquelon',
    'PN': 'Pitcairn',
    'PR': 'Puerto Rico',
    'PS': 'Palestine',
    'PT': 'Portugal',
    'PW': 'Palau',
    'PY': 'Paraguay',
    'QA': 'Qatar',
    'RE': 'Réunion',
    'RO': 'Romania',
    'RS': 'Serbia',
    'RU': 'Russia',
    'RW': 'Rwanda',
    'SA': 'Saudi Arabia',
    'SB': 'Solomon Islands',
    'SC': 'Seychelles',
    'SD': 'Sudan',
    'SE': 'Sweden',
    'SG': 'Singapore',
    'SH': 'Saint Helena',
    'SI': 'Slovenia',
    'SJ': 'Svalbard and Jan Mayen',
    'SK': 'Slovakia',
    'SL': 'Sierra Leone',
    'SM': 'San Marino',
    'SN': 'Senegal',
    'SO': 'Somalia',
    'SR': 'Suriname',
    'SS': 'South Sudan',
    'ST': 'Sao Tome and Principe',
    'SV': 'El Salvador',
    'SX': 'Sint Maarten',
    'SY': 'Syria',
    'SZ': 'Eswatini',
    'TC': 'Turks and Caicos Islands',
    'TD': 'Chad',
    'TF': 'French Southern Territories',
    'TG': 'Togo',
    'TH': 'Thailand',
    'TJ': 'Tajikistan',
    'TK': 'Tokelau',
    'TL': 'Timor-Leste',
    'TM': 'Turkmenistan',
    'TN': 'Tunisia',
    'TO': 'Tonga',
    'TR': 'Turkey',
    'TT': 'Trinidad and Tobago',
    'TV': 'Tuvalu',
    'TW': 'Taiwan',
    'TZ': 'Tanzania',
    'UA': 'Ukraine',
    'UG': 'Uganda',
    'UM': 'United States Minor Outlying Islands',
    'US': 'United States',
    'UY': 'Uruguay',
    'UZ': 'Uzbekistan',
    'VA': 'Vatican City',
    'VC': 'Saint Vincent and the Grenadines',
    'VE': 'Venezuela',
    'VG': 'British Virgin Islands',
    'VI': 'U.S. Virgin Islands',
    'VN': 'Vietnam',
    'VU': 'Vanuatu',
    'WF': 'Wallis and Futuna',
    'WS': 'Samoa',
    'YE': 'Yemen',
    'YT': 'Mayotte',
    'ZA': 'South Africa',
    'ZM': 'Zambia',
    'ZW': 'Zimbabwe'
};
// A name is "junk" if, after stripping everything that isn't a letter (any
// script) or a space, nothing is left — catches placeholder rows like "..",
// "...", or pure-emoji contacts.
function isUsableName(rawName) {
    return !!rawName.replace(/[^\p{L}\s]/gu, '').trim();
}

function tryParseValid(raw) {
    try {
        const number = phoneUtil.parseAndKeepRawInput(raw, DEFAULT_REGION);
        if (!phoneUtil.isValidNumber(number)) return null;
        return number;
    } catch {
        return null;
    }
}

// Some Cameroonian contacts get exported missing the leading mobile trunk
// digit (e.g. "77123456" instead of "677123456"), which fails validation
// outright rather than parsing into something merely mis-formatted — so the
// fix has to happen on the raw digits, before validation, not after. If the
// number as given isn't valid, and it looks like a bare CM local number one
// digit short of the standard 9, retry with a "6" restored at the front.
function tryFixMissingCameroonSix(raw) {
    let digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+237')) digits = digits.slice(3);
    digits = digits.replace(/^0/, '');
    if (digits.length !== 8 || digits.startsWith('6')) return null;
    return tryParseValid(`+237${'6'}${digits}`);
}

// Parses one raw phone string, returns { phone, country } in the shape
// bulkImportProspects expects, or null if the number isn't valid.
function parseOnePhone(raw) {
    if (!raw) return null;

    const number = tryParseValid(raw) || tryFixMissingCameroonSix(raw);
    if (!number) return null;

    const regionCode = phoneUtil.getRegionCodeForNumber(number) || DEFAULT_REGION;
    const e164 = phoneUtil.format(number, PNF.E164);
    const country = countryNameMap[regionCode] || regionCode || null;
    return { phone: e164, country };
}

// Pulls every raw phone string out of a Google Contacts row: any column
// matching "Phone N - Value", each of which may itself contain multiple
// numbers joined by ":::".
function collectRawGooglePhones(row) {
    const raws = [];
    for (const key of Object.keys(row)) {
        if (/^Phone\s*\d+\s*-\s*Value$/i.test(key)) {
            const val = String(row[key] || '').replace(/\s+/g, '');
            if (val) raws.push(...val.split(':::').filter(Boolean));
        }
    }
    return raws;
}

// Backward-compat path for the old pre-converted format (Name, Country
// Code, Phone Number, Country) — builds one E.164 candidate directly rather
// than re-deriving it from a raw Google export column.
function collectRawLegacyPhone(row) {
    const countryCode = String(row['Country Code'] ?? '').trim();
    const nationalRaw = String(row['Phone Number'] ?? '').replace(/\D/g, '');
    if (!countryCode && !nationalRaw) return [];
    // Drop a single leading 0 from the national number before concatenating
    // — some exports keep the domestic trunk prefix (e.g. "07578248217" for
    // a UK number), which isn't valid E.164.
    const national = nationalRaw.replace(/^0/, '');
    return [`${countryCode}${national}`];
}

function extractName(row) {
    const parts = [row['First Name'], row['Middle Name'], row['Last Name']]
        .map(v => (v || '').toString().trim())
        .filter(Boolean);
    let name = parts.join(' ').trim();
    if (!name) {
        name = String(row['Name'] ?? row['Nickname'] ?? row['File As'] ?? row.name ?? '').trim();
    }
    return name;
}

// Expands an array of raw CSV rows (Google Contacts export, or the legacy
// pre-converted format) into deduplicated, ready-to-insert prospect
// candidates plus skip counters for the import summary.
//
// We prospect a PERSON, not a phone number — a contact with several numbers
// on file must still become exactly one candidate, not one per number. The
// first valid number becomes the primary `phone`; a second valid number (if
// any) is kept as `alt_phone` so it isn't lost. Any numbers beyond that are
// dropped (rare in practice, and there's nowhere left to put them without a
// list-shaped phone field).
function expandContactRows(rows) {
    const seenPhones = new Set();
    const candidates = [];
    let skippedNoName = 0;
    let skippedInvalidPhone = 0;
    let skippedDuplicateInFile = 0;

    for (const row of rows) {
        const rawName = extractName(row);
        if (!isUsableName(rawName)) {
            skippedNoName++;
            continue;
        }

        let rawPhones = collectRawGooglePhones(row);
        if (rawPhones.length === 0) rawPhones = collectRawLegacyPhone(row);

        if (rawPhones.length === 0) {
            skippedInvalidPhone++;
            continue;
        }

        // Parse and de-dupe numbers within this single contact first (a
        // number repeated twice on the same person shouldn't count as a
        // cross-file duplicate).
        const ownNumbers = [];
        const ownSeen = new Set();
        for (const raw of rawPhones) {
            const parsed = parseOnePhone(raw);
            if (!parsed || ownSeen.has(parsed.phone)) continue;
            ownSeen.add(parsed.phone);
            ownNumbers.push(parsed);
        }

        if (ownNumbers.length === 0) {
            skippedInvalidPhone++;
            continue;
        }

        // Now drop any number already claimed by an earlier contact in this
        // file (e.g. a duplicate export entry for the same person).
        const usable = [];
        for (const parsed of ownNumbers) {
            if (seenPhones.has(parsed.phone)) {
                skippedDuplicateInFile++;
                continue;
            }
            usable.push(parsed);
        }

        if (usable.length === 0) continue; // every number on this contact was a file-wide duplicate

        const primary = usable[0];
        const secondary = usable[1] || null;
        seenPhones.add(primary.phone);
        if (secondary) seenPhones.add(secondary.phone);

        candidates.push({
            name: rawName.slice(0, 200),
            phone: primary.phone,
            alt_phone: secondary ? secondary.phone : null,
            country: primary.country,
            source: 'annuaire_telephonique'
        });
    }

    return { candidates, skippedNoName, skippedInvalidPhone, skippedDuplicateInFile };
}

module.exports = { expandContactRows };
