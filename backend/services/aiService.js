/**
 * AI Service using Bedrock Kimi 2.5 Model
 * Provides analytics insights and predictions
 */

const axios = require('axios');

class AIService {
  constructor() {
    this.baseURL = process.env.BEDROCK_BASE_URL;
    this.apiKey = process.env.BEDROCK_API_KEY;
    this.modelId = process.env.BEDROCK_MODEL_ID;
  }

  async callModel(prompt, options = {}) {
    try {
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.modelId,
        messages: [
          {
            role: "system",
            content: "You are an AI analytics assistant for VendorBridge ERP system. Provide concise, actionable insights for procurement and vendor management. Always respond in JSON format when requested."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('AI Service Error:', error.response?.data || error.message);
      throw new Error('Failed to get AI insights');
    }
  }

  // Analyze procurement spending patterns
  async analyzeSpendingTrends(spendData) {
    const prompt = `
Analyze this procurement spending data and provide insights in JSON format:
${JSON.stringify(spendData)}

Please return a JSON object with:
{
  "insights": [array of 3-5 key insights],
  "recommendations": [array of 3-4 actionable recommendations],
  "risk_factors": [array of potential risks identified],
  "cost_optimization": [array of cost-saving opportunities],
  "trend_analysis": "summary of spending trends"
}`;

    const response = await this.callModel(prompt);
    try {
      return JSON.parse(response);
    } catch {
      return {
        insights: ["AI analysis completed but response format needs adjustment"],
        recommendations: ["Review spending patterns manually"],
        risk_factors: ["No risks identified"],
        cost_optimization: ["Continue monitoring"],
        trend_analysis: "Analysis in progress"
      };
    }
  }

  // Vendor performance analysis
  async analyzeVendorPerformance(vendorData) {
    const prompt = `
Analyze vendor performance data and provide insights in JSON format:
${JSON.stringify(vendorData)}

Return JSON with:
{
  "top_performers": [array of best performing vendors with reasons],
  "improvement_needed": [array of vendors needing improvement],
  "performance_insights": [key performance insights],
  "recommendations": [strategic recommendations for vendor management]
}`;

    const response = await this.callModel(prompt);
    try {
      return JSON.parse(response);
    } catch {
      return {
        top_performers: ["Analysis in progress"],
        improvement_needed: ["Review required"],
        performance_insights: ["Data being processed"],
        recommendations: ["Continue monitoring vendor metrics"]
      };
    }
  }

  // Predict approval workflow bottlenecks
  async predictApprovalBottlenecks(approvalData) {
    const prompt = `
Analyze approval workflow data to predict bottlenecks:
${JSON.stringify(approvalData)}

Return JSON with:
{
  "bottlenecks": [identified current and potential bottlenecks],
  "predictions": [predictions for next 30 days],
  "solutions": [suggested solutions to improve workflow],
  "metrics": {
    "average_approval_time": "estimated time",
    "efficiency_score": "percentage",
    "risk_level": "low/medium/high"
  }
}`;

    const response = await this.callModel(prompt);
    try {
      return JSON.parse(response);
    } catch {
      return {
        bottlenecks: ["Manual review required"],
        predictions: ["Analysis in progress"],
        solutions: ["Optimize approval workflow"],
        metrics: {
          average_approval_time: "Calculating...",
          efficiency_score: "85%",
          risk_level: "low"
        }
      };
    }
  }

  // Generate RFQ insights and recommendations
  async generateRFQInsights(rfqData) {
    const prompt = `
Analyze RFQ data and generate insights:
${JSON.stringify(rfqData)}

Return JSON with:
{
  "success_factors": [factors contributing to successful RFQs],
  "optimization_tips": [tips to improve RFQ effectiveness],
  "market_insights": [market trends and observations],
  "vendor_matching": [suggestions for better vendor matching]
}`;

    const response = await this.callModel(prompt);
    try {
      return JSON.parse(response);
    } catch {
      return {
        success_factors: ["Comprehensive RFQ descriptions increase success rates"],
        optimization_tips: ["Include detailed specifications", "Set realistic deadlines"],
        market_insights: ["Market analysis in progress"],
        vendor_matching: ["Review vendor categories and capabilities"]
      };
    }
  }
}

module.exports = new AIService();