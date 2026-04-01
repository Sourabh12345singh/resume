"""
Python Flask Server for Resume Analysis
Runs independently from the TypeScript backend
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from pdf_text_extract import extract_pdf_text

def log_request_context(endpoint_name):
    """Log the incoming request shape for fast debugging."""
    print(f"\n--- {endpoint_name} REQUEST ---")
    print(f"Method: {request.method}")
    print(f"Content-Type: {request.content_type}")
    print(f"Files present: {list(request.files.keys())}")
    print(f"Form keys: {list(request.form.keys())}")
    print(f"JSON available: {request.is_json}")

    try:
        data = request.get_json(silent=True) if request.is_json else None
    except Exception as exc:
        print(f"JSON parse error: {exc}")
        data = None

    if data:
        print(f"JSON keys: {list(data.keys())}")
        if 'filePath' in data:
          print(f"JSON filePath: {data['filePath']}")
        if 'targetLevel' in data:
          print(f"JSON targetLevel: {data['targetLevel']}")

    if request.files and 'file' in request.files:
        uploaded = request.files['file']
        print(f"Uploaded file name: {uploaded.filename}")
        print(f"Uploaded content type: {uploaded.content_type}")
    if request.form and 'targetLevel' in request.form:
        print(f"Form targetLevel: {request.form.get('targetLevel')}")

# Import ML modules
try:
    from resume_analyzer_ml import get_analyzer as get_ml_analyzer
    from job_matcher_ml import get_matcher as get_ml_matcher
    ML_ENABLED = True
    print("✅ ML modules loaded successfully")
except ImportError as e:
    ML_ENABLED = False
    print(f"⚠️  ML modules not available: {e}")
    print("   Service will not be available")

app = Flask(__name__)
CORS(app)  # Enable CORS for TypeScript backend to communicate

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'Python Resume Analysis Service',
        'version': '1.0.0'
    })

@app.route('/ml/api/extract-text', methods=['POST'])
def extract_text():
    """Extract text from PDF file"""
    try:
        log_request_context("extract-text")

        # Check if file is in request
        if 'file' not in request.files:
            # Check if file path is provided
            data = request.get_json(silent=True) or {}
            if data and 'filePath' in data:
                pdf_path = data['filePath']
                print(f"Using filePath from JSON: {pdf_path}")
            else:
                return jsonify({
                    'success': False,
                    'error': 'No file or filePath provided'
                }), 400
        else:
            # Save uploaded file
            file = request.files['file']
            if file.filename == '':
                return jsonify({
                    'success': False,
                    'error': 'No file selected'
                }), 400
            
            # Save file temporarily
            pdf_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(pdf_path)
            print(f"Saved uploaded PDF to: {pdf_path}")

        print(f"PDF exists before extraction: {os.path.exists(pdf_path)}")
        
        # Extract text
        text = extract_pdf_text(pdf_path)
        
        if text:
            return jsonify({
                'success': True,
                'text': text,
                'length': len(text)
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to extract text from PDF'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/ml/api/analyze-text', methods=['POST'])
def analyze_text():
    """Analyze resume text and provide ATS score (ML-based)"""
    try:
        if not ML_ENABLED:
            return jsonify({
                'success': False,
                'error': 'ML modules not available'
            }), 503
            
        data = request.get_json(silent=True) or {}
        
        if not data or 'text' not in data:
            return jsonify({
                'success': False,
                'error': 'No text provided for analysis'
            }), 400
        
        text = data['text']
        target_level = data.get('targetLevel', 'experienced')
        
        # Use ML analyzer
        analyzer = get_ml_analyzer()
        result = analyzer.analyze_resume(text, target_level)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/ml/api/analyze-pdf', methods=['POST'])
def analyze_pdf():
    """Complete pipeline: extract text from PDF and analyze (ML-based)"""
    try:
        if not ML_ENABLED:
            return jsonify({
                'success': False,
                'error': 'ML modules not available'
            }), 503

        log_request_context("analyze-pdf")
            
        # Check if file is in request
        if 'file' not in request.files:
            # Check if file path is provided
            data = request.get_json(silent=True) or {}
            if data and 'filePath' in data:
                pdf_path = data['filePath']
                target_level = data.get('targetLevel', 'experienced')
                print(f"Using filePath from JSON: {pdf_path}")
                print(f"Using targetLevel from JSON: {target_level}")
            else:
                return jsonify({
                    'success': False,
                    'error': 'No file or filePath provided'
                }), 400
        else:
            # Save uploaded file
            file = request.files['file']
            if file.filename == '':
                return jsonify({
                    'success': False,
                    'error': 'No file selected'
                }), 400
            
            # Save file temporarily
            pdf_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(pdf_path)
            target_level = 'experienced'
            print(f"Saved uploaded PDF to: {pdf_path}")
            print(f"Using default targetLevel: {target_level}")
        
        # Step 1: Extract text
        print(f"PDF exists before extraction: {os.path.exists(pdf_path)}")
        text = extract_pdf_text(pdf_path)
        
        if not text:
            return jsonify({
                'success': False,
                'error': 'Failed to extract text from PDF'
            }), 500
        
        # Step 2: Analyze text using ML
        try:
            analyzer = get_ml_analyzer()
            analysis_result = analyzer.analyze_resume(text, target_level)
            
            # Add extracted text to response
            analysis_result['extractedText'] = text
            analysis_result['textLength'] = len(text)
            
            return jsonify(analysis_result)
        except Exception as ml_error:
            error_msg = str(ml_error)
            if 'image' in error_msg.lower() or 'does not support' in error_msg.lower():
                return jsonify({
                    'success': False,
                    'error': 'This PDF appears to be an image-based resume. Please upload a text-based PDF with selectable text.'
                }), 400
            raise
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        'service': 'Python Resume Analysis API',
        'version': '1.0.0',
        'mlEnabled': ML_ENABLED,
        'endpoints': {
            'health': '/health',
            'extractText': '/ml/api/extract-text',
            'analyzeText': '/ml/api/analyze-text',
            'analyzePdf': '/ml/api/analyze-pdf',
            'analyzeTextML': '/ml/api/ml/analyze-text',
            'analyzePdfML': '/ml/api/ml/analyze-pdf',
            'matchJob': '/ml/api/ml/match-job',
            'batchMatchJobs': '/ml/api/ml/batch-match-jobs'
        }
    })

# ========================================
# ML-BASED ENDPOINTS
# ========================================

@app.route('/ml/api/ml/analyze-text', methods=['POST'])
@app.route('/api/ml/analyze-text', methods=['POST'])
def analyze_text_ml():
    """Analyze resume text using ML (Sentence-BERT)"""
    if not ML_ENABLED:
        return jsonify({
            'success': False,
            'error': 'ML modules not available. Install: pip install sentence-transformers torch'
        }), 503
    
    try:
        data = request.get_json(silent=True) or {}
        
        if not data or 'text' not in data:
            return jsonify({
                'success': False,
                'error': 'No text provided for analysis'
            }), 400
        
        text = data['text']
        target_level = data.get('targetLevel', None)  # 'entry', 'mid', 'senior'
        
        # Use ML analyzer
        analyzer = get_ml_analyzer()
        result = analyzer.analyze_resume(text, target_level)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/ml/api/ml/analyze-pdf', methods=['POST'])
@app.route('/api/ml/analyze-pdf', methods=['POST'])
def analyze_pdf_ml():
    """Complete ML pipeline: extract text from PDF and analyze with ML"""
    if not ML_ENABLED:
        return jsonify({
            'success': False,
            'error': 'ML modules not available. Install: pip install sentence-transformers torch'
        }), 503
    
    try:
        log_request_context("ml/analyze-pdf")

        # Check if file is in request
        if 'file' not in request.files:
            # Check if file path is provided
            data = request.get_json(silent=True) or {}
            if data and 'filePath' in data:
                pdf_path = data['filePath']
                print(f"Using filePath from JSON: {pdf_path}")
            else:
                return jsonify({
                    'success': False,
                    'error': 'No file or filePath provided'
                }), 400
        else:
            # Save uploaded file
            file = request.files['file']
            if file.filename == '':
                return jsonify({
                    'success': False,
                    'error': 'No file selected'
                }), 400
            
            # Save file temporarily
            pdf_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(pdf_path)
            print(f"Saved uploaded PDF to: {pdf_path}")
        
        # Step 1: Extract text
        print(f"PDF exists before extraction: {os.path.exists(pdf_path)}")
        text = extract_pdf_text(pdf_path)
        
        if not text:
            return jsonify({
                'success': False,
                'error': 'Failed to extract text from PDF'
            }), 500
        
        # Get target level from form data or JSON
        if request.files:
            target_level = request.form.get('targetLevel', 'experienced')
        else:
            data = request.get_json(silent=True) or {}
            target_level = data.get('targetLevel', 'experienced')
        
        # Step 2: Analyze text with ML
        analyzer = get_ml_analyzer()
        analysis_result = analyzer.analyze_resume(text, target_level)
        
        # Add extracted text to response
        analysis_result['extractedText'] = text
        analysis_result['textLength'] = len(text)
        
        # DEBUG: Log what we're returning
        print(f"🔍 PYTHON RETURNING extractedInfo.skills: {analysis_result.get('extractedInfo', {}).get('skills', [])}") 
        print(f"🔍 PYTHON skills count: {len(analysis_result.get('extractedInfo', {}).get('skills', []))}")
        
        return jsonify(analysis_result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/ml/api/ml/match-job', methods=['POST'])
@app.route('/api/ml/match-job', methods=['POST'])
def match_job_ml():
    """Calculate match score between resume and single job using ML"""
    if not ML_ENABLED:
        return jsonify({
            'success': False,
            'error': 'ML modules not available. Install: pip install sentence-transformers torch'
        }), 503
    
    try:
        data = request.get_json(silent=True) or {}
        
        if not data or 'resumeText' not in data or 'jobDescription' not in data:
            return jsonify({
                'success': False,
                'error': 'resumeText and jobDescription are required'
            }), 400
        
        resume_text = data['resumeText']
        job_description = data['jobDescription']
        job_title = data.get('jobTitle', '')
        ats_score = data.get('atsScore', 0)
        experience_level = data.get('experienceLevel', 'entry')
        years_of_experience = data.get('yearsOfExperience', 0)
        
        print(f"\n🎯 API: Single Job Match Request")
        print(f"   Job: {job_title[:60] if job_title else 'N/A'}")
        print(f"   Resume: {len(resume_text)} chars, ATS: {ats_score}")
        
        # Use ML matcher
        matcher = get_ml_matcher()
        result = matcher.calculate_match_score(
            resume_text, job_description, job_title, ats_score,
            experience_level, years_of_experience
        )
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/ml/api/ml/batch-match-jobs', methods=['POST'])
@app.route('/api/ml/batch-match-jobs', methods=['POST'])
def batch_match_jobs_ml():
    """Calculate match scores for multiple jobs (batch processing)"""
    if not ML_ENABLED:
        return jsonify({
            'success': False,
            'error': 'ML modules not available. Install: pip install sentence-transformers torch'
        }), 503
    
    try:
        data = request.get_json(silent=True) or {}
        
        if not data or 'resumeText' not in data or 'jobs' not in data:
            return jsonify({
                'success': False,
                'error': 'resumeText and jobs array are required'
            }), 400
        
        resume_text = data['resumeText']
        jobs = data['jobs']
        ats_score = data.get('atsScore', 0)
        experience_level = data.get('experienceLevel', 'entry')
        years_of_experience = data.get('yearsOfExperience', 0)
        
        if not isinstance(jobs, list) or len(jobs) == 0:
            return jsonify({
                'success': False,
                'error': 'jobs must be a non-empty array'
            }), 400
        
        print(f"\n🚀 API: Batch Job Match Request")
        print(f"   Jobs: {len(jobs)}")
        print(f"   Resume: {len(resume_text)} chars, ATS: {ats_score}")
        print(f"   Candidate: {experience_level} level, {years_of_experience} years\n")
        
        # Use ML matcher for batch processing
        matcher = get_ml_matcher()
        results = matcher.batch_calculate_matches(
            resume_text, jobs, ats_score,
            experience_level, years_of_experience
        )
        
        return jsonify({
            'success': True,
            'results': results,
            'count': len(results)
        })
        
    except Exception as e:
        print(f"❌ Error in batch matching: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ========================================
# END ML ENDPOINTS
# ========================================

if __name__ == '__main__':
    print('=' * 60)
    print('🐍 Python Resume Analysis Service')
    print('=' * 60)
    print(f'ML Enabled: {"✅ Yes" if ML_ENABLED else "⚠️  No (using rule-based fallback)"}')
    print('Server running on: http://localhost:5000')
    print('Endpoints:')
    print('  GET  /health - Health check')
    print('  POST /ml/api/extract-text - Extract text from PDF')
    print('  POST /ml/api/analyze-text - Analyze resume text (rule-based)')
    print('  POST /ml/api/analyze-pdf - Complete analysis pipeline (rule-based)')
    if ML_ENABLED:
        print('  POST /ml/api/ml/analyze-text - Analyze resume text (ML)')
        print('  POST /ml/api/ml/analyze-pdf - Complete analysis pipeline (ML)')
        print('  POST /ml/api/ml/match-job - Match resume to job (ML)')
        print('  POST /ml/api/ml/batch-match-jobs - Batch match jobs (ML)')
    print('=' * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=False)
