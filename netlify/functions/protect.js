const crypto = require('crypto');
const JSZip = require('jszip');

// License validation code template
const LICENSE_CHECKER_PY = `
import os
import sys
import uuid
import requests
import subprocess
import tempfile
import shutil

class LicenseManager:
    def __init__(self, app_name):
        self.app_name = app_name
        self.api_url = "https://your-domain.com/.netlify/functions/api"
        self.hwid_file = f".{app_name}_hwid"
        self.license_file = f".{app_name}_license"
    
    def get_hwid(self):
        """Generate hardware ID"""
        try:
            # Get machine-specific identifiers
            machine = uuid.getnode()
            processor = platform.processor() if hasattr(platform, 'processor') else 'unknown'
            
            # Create a consistent HWID
            hwid_data = f"{machine}-{processor}-{os.name}"
            hwid = hashlib.sha256(hwid_data.encode()).hexdigest()[:16]
            return hwid
        except:
            # Fallback to simple UUID
            return str(uuid.uuid4())[:16]
    
    def validate_license(self, license_key):
        """Validate license key with server"""
        try:
            hwid = self.get_hwid()
            
            payload = {
                "action": "validateLicense",
                "payload": {
                    "key": license_key,
                    "hwid": hwid,
                    "app_name": self.app_name
                }
            }
            
            response = requests.post(self.api_url, json=payload, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                return result.get("ok", False), result.get("message", "Invalid license")
            else:
                return False, "Server error"
                
        except Exception as e:
            return False, f"Network error: {str(e)}"
    
    def check_local_license(self):
        """Check if valid license exists locally"""
        try:
            if os.path.exists(self.license_file):
                with open(self.license_file, 'r') as f:
                    stored_key = f.read().strip()
                
                if stored_key:
                    valid, message = self.validate_license(stored_key)
                    if valid:
                        return True, "License valid"
                    else:
                        # Remove invalid license
                        if os.path.exists(self.license_file):
                            os.remove(self.license_file)
                        return False, message
            
            return False, "No license found"
        except:
            return False, "License check failed"
    
    def prompt_license(self):
        """Prompt user for license key"""
        print(f"\\n=== {self.app_name} License Validation ===")
        print("Please enter your license key:")
        
        while True:
            try:
                license_key = input("License Key: ").strip()
                if not license_key:
                    print("License key cannot be empty.")
                    continue
                
                valid, message = self.validate_license(license_key)
                
                if valid:
                    # Save valid license
                    with open(self.license_file, 'w') as f:
                        f.write(license_key)
                    print(f"✓ License validated successfully!")
                    return True
                else:
                    print(f"✗ Invalid license: {message}")
                    retry = input("Try again? (y/n): ").lower()
                    if retry != 'y':
                        return False
                        
            except KeyboardInterrupt:
                print("\\nLicense validation cancelled.")
                return False
            except Exception as e:
                print(f"Error: {e}")
                return False

def main():
    """Main license check function"""
    app_name = "%%APP_NAME%%"  # This will be replaced
    
    # Check if license is already valid
    license_manager = LicenseManager(app_name)
    valid, message = license_manager.check_local_license()
    
    if valid:
        print(f"✓ License valid: {message}")
        return True
    
    # Prompt for license if not valid
    if not license_manager.prompt_license():
        print("License validation failed. Exiting.")
        sys.exit(1)
    
    return True

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\\nInterrupted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"License system error: {e}")
        sys.exit(1)
`;

// Python launcher template for .exe files
const EXE_LAUNCHER_PY = `
import os
import sys
import subprocess
import tempfile
import shutil

# License checker code (same as above)
%%LICENSE_CHECKER%%

def launch_exe():
    """Launch the original executable"""
    exe_path = "%%EXE_NAME%%"  # This will be replaced
    
    if not os.path.exists(exe_path):
        print(f"Error: {exe_path} not found!")
        return False
    
    try:
        # Launch the executable
        subprocess.Popen([exe_path])
        return True
    except Exception as e:
        print(f"Error launching {exe_path}: {e}")
        return False

def main():
    """Main function"""
    # Check license first
    if not main():
        print("License validation failed. Cannot launch application.")
        return
    
    # Launch the original executable
    if not launch_exe():
        print("Failed to launch application.")
        return

if __name__ == "__main__":
    main()
`;

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Parse multipart form data
        const formData = parseMultipartData(event.body, event.headers['content-type']);
        
        if (!formData.file || !formData.app_name) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing file or app_name' })
            };
        }

        const fileBuffer = Buffer.from(formData.file.content, 'base64');
        const fileName = formData.filename;
        const fileExt = fileName.split('.').pop().toLowerCase();
        const appName = formData.app_name;

        const zip = new JSZip();

        if (fileExt === 'py') {
            // Python file: inject license check at the top
            const originalCode = fileBuffer.toString('utf-8');
            const licenseCode = LICENSE_CHECKER_PY.replace('%%APP_NAME%%', appName);
            
            // Add required imports at the top
            const protectedCode = `import os
import sys
import uuid
import hashlib
import platform
import requests

# License validation
${licenseCode}

# License check
if __name__ == "__main__":
    if not main():
        sys.exit(1)

# Original application code below
${originalCode}`;

            zip.file(fileName, protectedCode);
            zip.file('README.txt', `Protected Python File: ${fileName}

This file has been protected with KeyManager license validation.

To run this application:
1. Make sure you have Python installed
2. Install required packages: pip install requests
3. Run: python ${fileName}

You will need a valid license key to run this application.`);

        } else if (fileExt === 'exe') {
            // EXE file: create Python launcher
            const licenseCode = LICENSE_CHECKER_PY.replace('%%APP_NAME%%', appName);
            const launcherCode = EXE_LAUNCHER_PY
                .replace('%%LICENSE_CHECKER%%', licenseCode)
                .replace('%%EXE_NAME%%', fileName);
            
            zip.file('launcher.py', launcherCode);
            zip.file(fileName, fileBuffer);
            zip.file('README.txt', `Protected Executable: ${fileName}

This file has been protected with KeyManager license validation.

To run this application:
1. Make sure you have Python installed
2. Install required packages: pip install requests
3. Run: python launcher.py

You will need a valid license key to run this application.

Note: The original executable (${fileName}) will only be launched after successful license validation.`);
        } else {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Unsupported file type' })
            };
        }

        // Generate the ZIP file
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        
        // Return the ZIP file
        const protectedFileName = `protected_${fileName.replace(/\.[^.]+$/, '')}.zip`;
        
        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${protectedFileName}"`
            },
            body: zipBuffer.toString('base64'),
            isBase64Encoded: true
        };

    } catch (error) {
        console.error('Protection error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Protection failed: ' + error.message })
        };
    }
};

// Helper function to parse multipart form data
function parseMultipartData(body, contentType) {
    // This is a simplified parser - in production, use a proper multipart parser
    const boundary = contentType.split('boundary=')[1];
    const parts = body.split(`--${boundary}`);
    
    const formData = {};
    
    for (const part of parts) {
        if (part.includes('Content-Disposition')) {
            const nameMatch = part.match(/name="([^"]+)"/);
            const filenameMatch = part.match(/filename="([^"]+)"/);
            
            if (nameMatch) {
                const name = nameMatch[1];
                const content = part.split('\r\n\r\n')[1].split('\r\n')[0];
                
                if (filenameMatch) {
                    formData[name] = {
                        filename: filenameMatch[1],
                        content: content
                    };
                } else {
                    formData[name] = content;
                }
            }
        }
    }
    
    return formData;
}
