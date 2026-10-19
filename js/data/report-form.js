/* Report form — the form a user submits before the project report (PDF) unlocks, and the database record it becomes
   (Supabase table report_submissions, created by server/supabase/schema.sql).

   ONE SOURCE for the browser and the server: the browser loads this file as a script (AM.reportForm), and the
   submission server (server/submissions.py) reads the same file and parses the part between the two markers as JSON.
   So keep that part valid JSON: double quotes, no comments, no trailing commas.

   fields         the form, in order. key = what the browser sends; type: text, email, select, country, textarea,
                  consent (required checkbox), checkbox (optional, unchecked by default).
   project        the project summary sent with the form (from AM.derive, never typed), and its allowed values.
                  measuredRt60 is the RT60 at 1000 Hz (the reference band, where a take's validity is decided);
                  measuredRt60Avg the room's average RT60, the mean of the bands 125–4000 Hz that were measured, the value the app shows
                  and compares with the target, or null when one band has no value (app versions before 2026.10.15
                  stored the mean of 500, 1000 and 2000 Hz there: the app_version column tells them apart).
                  predictedRt60 is the predicted RT60 at 1000 Hz; predictedRt60Avg the predicted average over the bands
                  of the measured all-band average (null without a prediction, or when a product has no tested α there).
                  From app version 2026.10.16 every measured and predicted value is taken from the room averaged over its
                  measuring positions (at least two), and the app's verdict is decided band by band over the bands the
                  room's criterion sets: the verdict and that summary are not stored here (no column was added or
                  changed; the app_version column tells the versions apart).
                  "optional": true marks a value added later: a request without it is accepted (as null).
   columns        the table's columns, in order: column = its name in the database (schema.sql), header = how it is
                  described, source = where the value comes from. Nothing that is not listed here is ever sent or
                  written. "server.*" values are set by the server, not the browser. "optional": true marks a column
                  added after the table was first made: until schema.sql is run again the row is stored without it.
   appVersion     written to the app_version column by the server. Change it with each release.

   {brand} in a text is replaced with the brand name (AM.brand.name). */
(function (root) {
  'use strict';
  const spec = /* FORM-SPEC-BEGIN */ {
    "specVersion": 1,
    "appVersion": "2026.10.16",
    "fields": [
      { "key": "fullName", "label": "Full name", "type": "text", "required": true, "minLength": 2, "maxLength": 100, "autocomplete": "name" },
      { "key": "email", "label": "Email address", "type": "email", "required": true, "maxLength": 254, "autocomplete": "email" },
      { "key": "role", "label": "Profession / role", "type": "select", "required": true, "placeholder": "Choose your role",
        "options": ["Acoustic Consultant / Engineer", "Architect", "Interior Designer", "Contractor / Installer", "Manufacturer / Supplier", "Student / Researcher", "Other"] },
      { "key": "organization", "label": "Organization / company", "type": "text", "required": false, "maxLength": 120, "autocomplete": "organization" },
      { "key": "country", "label": "Country", "type": "country", "required": true, "placeholder": "Choose a country" },
      { "key": "purpose", "label": "Purpose of using the application", "type": "select", "required": true, "placeholder": "Choose a purpose",
        "options": ["Acoustic assessment", "Room design", "Product / treatment selection", "Existing-room improvement", "Educational / research use", "Other"] },
      { "key": "feedback", "label": "Feedback or comments", "type": "textarea", "required": false, "maxLength": 1000 },
      { "key": "consent", "type": "consent", "required": true,
        "label": "I agree that the details above and the project summary listed below are sent to {brand} and stored in its secure database, so that I can receive this report." },
      { "key": "marketing", "type": "checkbox", "required": false,
        "label": "Send me occasional emails from {brand} about acoustic products and resources. Optional: not needed for the report." }
    ],
    "project": [
      { "key": "projectId", "type": "string", "maxLength": 64, "pattern": "^[A-Za-z0-9_-]{1,64}$" },
      { "key": "projectName", "type": "string", "maxLength": 120, "allowEmpty": true },
      { "key": "roomType", "type": "string", "maxLength": 80, "allowEmpty": true },
      { "key": "roomVolumeM3", "type": "number", "min": 0.1, "max": 1000000, "decimals": 1, "nullable": true },
      { "key": "targetRt60", "type": "number", "min": 0.05, "max": 20, "decimals": 2, "nullable": true },
      { "key": "measuredRt60", "type": "number", "min": 0.05, "max": 20, "decimals": 2, "nullable": true },
      { "key": "measuredRt60Avg", "type": "number", "min": 0.05, "max": 20, "decimals": 2, "nullable": true, "optional": true },
      { "key": "measurementMethod", "type": "string", "maxLength": 40, "allowEmpty": true, "pattern": "^[A-Za-z0-9 ()./-]{0,40}$" },
      { "key": "predictedRt60", "type": "number", "min": 0.05, "max": 20, "decimals": 2, "nullable": true },
      { "key": "predictedRt60Avg", "type": "number", "min": 0.05, "max": 20, "decimals": 2, "nullable": true, "optional": true },
      { "key": "treatmentStatus", "type": "string", "enum": ["No treatment", "Not selected", "Planned", "Predicted", "Measured after treatment"] },
      { "key": "customMaterials", "type": "materials", "optional": true, "maxItems": 30, "kinds": ["construction", "finish"], "surfaces": ["wall", "floor", "ceiling"], "nameMin": 2, "nameMax": 80, "notesMax": 300 }
    ],
    "columns": [
      { "column": "submission_id", "header": "Submission ID", "source": "server.submissionId" },
      { "column": "submitted_at", "header": "Submission timestamp", "source": "server.timestamp" },
      { "column": "full_name", "header": "Full name", "source": "form.fullName" },
      { "column": "email", "header": "Email", "source": "form.email" },
      { "column": "profession_role", "header": "Profession / role", "source": "form.role" },
      { "column": "organization", "header": "Organization", "source": "form.organization" },
      { "column": "country", "header": "Country", "source": "form.country" },
      { "column": "purpose", "header": "Purpose", "source": "form.purpose" },
      { "column": "feedback", "header": "Feedback", "source": "form.feedback" },
      { "column": "consent_given", "header": "Consent recorded", "source": "server.consent" },
      { "column": "consent_recorded_at", "header": "Consent recorded at", "source": "server.timestamp" },
      { "column": "marketing_consent", "header": "Marketing consent", "source": "server.marketing" },
      { "column": "project_id", "header": "Project ID", "source": "project.projectId" },
      { "column": "project_name", "header": "Project name", "source": "project.projectName" },
      { "column": "room_type", "header": "Room type", "source": "project.roomType" },
      { "column": "room_volume_m3", "header": "Room volume (m³)", "source": "project.roomVolumeM3" },
      { "column": "target_rt60_s", "header": "Target RT60 (s)", "source": "project.targetRt60" },
      { "column": "measured_rt60_s", "header": "Measured RT60 at 1000 Hz (s)", "source": "project.measuredRt60" },
      { "column": "measured_rt60_avg_s", "header": "Average RT60 125–4000 Hz (s)", "source": "project.measuredRt60Avg", "optional": true },
      { "column": "measurement_method", "header": "Measurement method", "source": "project.measurementMethod" },
      { "column": "predicted_rt60_s", "header": "Predicted RT60 at 1000 Hz (s)", "source": "project.predictedRt60" },
      { "column": "predicted_rt60_avg_s", "header": "Predicted average RT60 125–4000 Hz (s)", "source": "project.predictedRt60Avg", "optional": true },
      { "column": "treatment_status", "header": "Treatment status", "source": "project.treatmentStatus" },
      { "column": "app_version", "header": "Application version", "source": "server.appVersion" },
      { "column": "custom_materials", "header": "Materials typed in (not in the library)", "source": "project.customMaterials", "optional": true }
    ],
    "countries": [
      "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
      "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
      "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
      "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
      "Côte d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czechia", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic",
      "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland",
      "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea",
      "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran",
      "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati",
      "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein",
      "Lithuania", "Luxembourg", "Macao", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands",
      "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique",
      "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea",
      "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
      "Philippines", "Poland", "Portugal", "Puerto Rico", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia",
      "Saint Vincent and the Grenadines", "Samoa", "San Marino", "São Tomé and Príncipe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore",
      "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan",
      "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo",
      "Tonga", "Trinidad and Tobago", "Tunisia", "Türkiye", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom",
      "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
      "Other"
    ]
  } /* FORM-SPEC-END */;
  root.AM = root.AM || {};
  root.AM.reportForm = spec;
})(typeof window !== 'undefined' ? window : globalThis);
